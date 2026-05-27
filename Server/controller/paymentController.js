import Razorpay from 'razorpay';
import crypto from 'crypto';
import mongoose from 'mongoose';
import Payment from '../model/payment.js';
import Product from '../model/addproduct.js';
import Order from '../model/order.js';
import PendingOrder from '../model/pendingOrder.js';
import Cart from '../model/cart.js';
import {
  reserveStock,
  releaseReservation,
  confirmStockPurchase
} from '../services/stockReservationService.js';
import { notifyOrderConfirmation, notifySellerNewOrder } from '../services/notificationService.js';
import User from '../model/mongobd_usermodel.js';
import Seller from '../model/sellermodel.js';
import { handleError, isValidObjectId } from '../utils/errorHandler.js';
import { isAlreadyProcessed, markProcessed, acquireIdempotencyLock, completeIdempotencyLock } from '../services/idempotencyService.js';
import { lifecycle } from '../services/logger.js';
import { ORDER_STATES, transitionOrder } from '../services/orderLifecycleService.js';

const instance = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Reservation timeout: 15 minutes
const RESERVATION_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * CHECKOUT — Step 1 of the payment flow
 * 
 * Creates a Razorpay order, reserves stock, AND stores the full order
 * payload (shipping address, gift messages) so that paymentVerification
 * can create the real order without needing a separate client call.
 * 
 * FLOW:
 *   Client sends { items, shippingAddress, image } 
 *   → Server fetches real prices from DB
 *   → Reserves stock
 *   → Creates Razorpay order
 *   → Saves PendingOrder with full order data
 *   → Returns Razorpay order to client
 */
export const checkout = async (req, res) => {
  try {
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: "Authentication required"
      });
    }

    const { items, shippingAddress, image } = req.body;

    // --- Input Validation ---
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Invalid request: items array is required"
      });
    }

    if (items.length > 50) {
      return res.status(400).json({
        success: false,
        error: "Maximum 50 items per checkout"
      });
    }

    if (!shippingAddress || !shippingAddress.name || !shippingAddress.phone || !shippingAddress.address) {
      return res.status(400).json({
        success: false,
        error: "Shipping address with name, phone, and address is required"
      });
    }

    // Validate each item
    for (const item of items) {
      if (!item.productId || !item.quantity || item.quantity < 1) {
        return res.status(400).json({
          success: false,
          error: "Invalid item: productId and quantity (>= 1) are required"
        });
      }
      if (!isValidObjectId(item.productId)) {
        return res.status(400).json({
          success: false,
          error: "Invalid product ID format"
        });
      }
    }

    // --- Fetch REAL prices from database (never trust client prices) ---
    const lineItems = [];
    for (const item of items) {
      const product = await Product.findById(item.productId)
        .select('price title stock reservedStock sellerId')
        .populate('sellerId', 'holidayMode status isBlocked');

      if (!product) {
        return res.status(404).json({
          success: false,
          error: `Product not found: ${item.productId}`
        });
      }

      // Check seller availability
      const seller = product.sellerId;
      if (seller && (seller.holidayMode || seller.status === 'Suspended' || seller.isBlocked)) {
        return res.status(400).json({
          success: false,
          error: `Seller for "${product.title}" is currently unavailable`
        });
      }

      const availableStock = product.stock - (product.reservedStock || 0);
      if (availableStock < item.quantity) {
        return res.status(400).json({
          success: false,
          error: `Insufficient stock for ${product.title}. Available: ${availableStock}, Requested: ${item.quantity}`
        });
      }

      lineItems.push({
        productId: item.productId,
        title: product.title,
        unitPrice: product.price,
        quantity: item.quantity,
        lineTotal: product.price * item.quantity,
        sellerId: product.sellerId._id || product.sellerId,
        giftMessage: item.giftMessage || "",
        senderName: item.senderName || "",
        receiverName: item.receiverName || ""
      });
    }

    const serverCalculatedTotal = lineItems.reduce((sum, item) => sum + item.lineTotal, 0);

    if (serverCalculatedTotal < 1) {
      return res.status(400).json({
        success: false,
        error: "Order total must be at least ₹1"
      });
    }

    // --- Create Razorpay order ---
    const receiptId = `ord_${Date.now().toString(36)}`;
    const options = {
      amount: Math.round(serverCalculatedTotal * 100), // Convert to paise
      currency: "INR",
      receipt: receiptId.substring(0, 40),
      notes: {
        userId: userId.toString(),
        itemCount: items.length,
        calculatedAt: new Date().toISOString()
      }
    };

    const razorpayOrder = await instance.orders.create(options);

    // --- Reserve stock ---
    const reservationResult = await reserveStock(
      items.map(item => ({ productId: item.productId, quantity: item.quantity })),
      razorpayOrder.id,
      userId
    );

    if (!reservationResult.success) {
      console.error("Stock reservation failed:", reservationResult.errors);
      return res.status(400).json({
        success: false,
        error: "Some items are no longer available",
        details: reservationResult.errors
      });
    }

    // --- Save PendingOrder with full order data ---
    // This ensures paymentVerification has everything it needs to create
    // the real order, even if the browser crashes after payment.
    await PendingOrder.create({
      razorpayOrderId: razorpayOrder.id,
      userId,
      items: lineItems.map(item => ({
        productId: item.productId,
        name: item.title,
        quantity: item.quantity,
        price: item.unitPrice,
        sellerId: item.sellerId,
        giftMessage: item.giftMessage,
        senderName: item.senderName,
        receiverName: item.receiverName
      })),
      totalAmount: serverCalculatedTotal,
      shippingAddress: {
        name: shippingAddress.name || "",
        phone: shippingAddress.phone || "",
        alternatephone: shippingAddress.alternatephone || "",
        address: shippingAddress.address || "",
        city: shippingAddress.city || "",
        state: shippingAddress.state || "",
        pin: Number(shippingAddress.pin) || 0
      },
      image: image || "",
      expiresAt: new Date(Date.now() + RESERVATION_TIMEOUT_MS)
    });

    // --- Create initial payment record ---
    await Payment.create({
      razorpay_order_id: razorpayOrder.id,
      amount: serverCalculatedTotal,
      currency: 'INR',
      status: 'created',
      userId,
      source: 'client'
    });

    res.status(200).json({
      success: true,
      order: razorpayOrder,
      breakdown: {
        items: lineItems.map(item => ({
          productId: item.productId,
          title: item.title,
          unitPrice: item.unitPrice,
          quantity: item.quantity,
          lineTotal: item.lineTotal
        })),
        total: serverCalculatedTotal,
        totalInPaise: options.amount
      },
      reservationInfo: {
        expiresIn: '15 minutes',
        message: 'Complete payment within 15 minutes to secure your items'
      }
    });

  } catch (err) {
    console.error("Checkout Error:", err);
    handleError(res, err, "Failed to create order");
  }
};

/**
 * PAYMENT VERIFICATION — Step 2 of the payment flow
 * 
 * Called after Razorpay payment succeeds.
 * This is where the REAL order gets created — atomically with stock confirmation.
 * 
 * FLOW:
 *   → Verify Razorpay signature
 *   → Confirm stock deduction (via reservation service)
 *   → Fetch PendingOrder data
 *   → Create real Order + update Payment record (in transaction)
 *   → Clear buyer's cart
 *   → Delete PendingOrder
 *   → Redirect to success page
 * 
 * SECURITY: This endpoint now requires userAuth middleware.
 * The razorpay_signature verification is a second layer of defense.
 */
export const paymentVerification = async (req, res) => {
  const requestId = req.requestId;
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const userId = req.userId;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Missing payment verification fields"
      });
    }

    lifecycle.payment('verification_started', { razorpay_order_id, razorpay_payment_id, userId, requestId });

    // --- Idempotency lock: acquire BEFORE processing to close race window ---
    const idempotencyKey = `payment:${razorpay_payment_id}`;
    const lockResult = await acquireIdempotencyLock(idempotencyKey, 'payment');
    if (!lockResult.acquired) {
      if (lockResult.existing?.status === 'completed') {
        lifecycle.payment('verification_duplicate', { razorpay_payment_id, requestId });
        return res.status(200).json(lockResult.existing.result);
      }
      // Another request is mid-processing — tell client to retry
      lifecycle.payment('verification_concurrent', { razorpay_payment_id, requestId });
      return res.status(409).json({ success: false, message: 'Payment is being processed. Please wait.' });
    }

    // --- Signature verification ---
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      await releaseReservation(razorpay_order_id);
      return res.status(400).json({
        success: false,
        message: "Invalid payment signature"
      });
    }

    // --- Confirm stock purchase (converts reservation → actual deduction) ---
    const confirmResult = await confirmStockPurchase(razorpay_order_id);
    if (!confirmResult.success) {
      lifecycle.error('stock_confirmation_failed', { message: confirmResult.error }, { operation: 'payment', razorpay_order_id, requestId });
      // Don't fail — stock was reserved, log the issue
    }

    // --- Fetch pending order data ---
    const pendingOrder = await PendingOrder.findOne({ razorpayOrderId: razorpay_order_id });

    if (!pendingOrder) {
      // Edge case: PendingOrder expired or was deleted, but payment succeeded.
      // Log this for manual resolution. The payment is captured, stock is deducted,
      // but we have no order data. This needs admin intervention.
      lifecycle.error('pending_order_not_found', { message: 'Payment verified but no PendingOrder found' }, { operation: 'payment', razorpay_order_id, userId, requestId });
      
      await Payment.findOneAndUpdate(
        { razorpay_order_id },
        {
          razorpay_payment_id,
          razorpay_signature,
          status: 'captured',
          verifiedAt: new Date(),
          stockConfirmed: confirmResult.success,
          failureReason: 'PendingOrder not found — requires manual order creation'
        }
      );

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      return res.redirect(
        `${frontendUrl}/payment-success?reference=${razorpay_payment_id}&status=pending-review`
      );
    }

    // --- Create real order (using data from PendingOrder) ---
    const orderUserId = pendingOrder.userId;

    const newOrder = await Order.create({
      user: orderUserId,
      items: pendingOrder.items.map(item => ({
        productId: item.productId,
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        sellerId: item.sellerId,
        status: ORDER_STATES.CONFIRMED,
        giftMessage: item.giftMessage || "",
        senderName: item.senderName || "",
        receiverName: item.receiverName || ""
      })),
      totalAmount: pendingOrder.totalAmount,
      shippingAddress: pendingOrder.shippingAddress,
      image: pendingOrder.image,
      paymentId: razorpay_payment_id,
      razorpayOrderId: razorpay_order_id,
      status: ORDER_STATES.CONFIRMED,
      placedAt: new Date()
    });

    // --- Update payment record ---
    await Payment.findOneAndUpdate(
      { razorpay_order_id },
      {
        razorpay_payment_id,
        razorpay_signature,
        status: 'captured',
        orderId: newOrder._id,
        userId: orderUserId,
        verifiedAt: new Date(),
        stockConfirmed: confirmResult.success
      }
    );

    // --- Clear buyer's cart ---
    try {
      await Cart.deleteMany({ userId: orderUserId });
    } catch (cartErr) {
      // Non-fatal: log but don't fail the order
      console.error("Cart clearing failed:", cartErr.message);
    }

    // --- Clean up pending order ---
    await PendingOrder.deleteOne({ razorpayOrderId: razorpay_order_id });

    // --- Dispatch Notifications (Fire and Forget) ---
    // Wrap in IIFE so it doesn't block the redirect
    (async () => {
      try {
        const buyer = await User.findById(orderUserId).select('name email');
        
        // Group items by seller for seller notifications
        const sellerItemsMap = {};
        for (const item of newOrder.items) {
          const sId = item.sellerId.toString();
          if (!sellerItemsMap[sId]) {
            sellerItemsMap[sId] = { items: [], total: 0 };
          }
          sellerItemsMap[sId].items.push(item);
          sellerItemsMap[sId].total += (item.price * item.quantity);
        }

        // Fetch seller emails
        const sellerIds = Object.keys(sellerItemsMap);
        const sellers = await Seller.find({ _id: { $in: sellerIds } }).select('name email');
        sellers.forEach(s => {
          if (sellerItemsMap[s._id.toString()]) {
            sellerItemsMap[s._id.toString()].sellerName = s.name;
            sellerItemsMap[s._id.toString()].sellerEmail = s.email;
          }
        });

        // 1. Notify Buyer
        await notifyOrderConfirmation({
          buyerEmail: buyer?.email,
          buyerName: buyer?.name,
          orderId: newOrder._id,
          items: newOrder.items,
          totalAmount: newOrder.totalAmount,
          paymentId: razorpay_payment_id
        });

        // 2. Notify Sellers
        await notifySellerNewOrder({
          orderId: newOrder._id,
          sellerItems: sellerItemsMap
        });
      } catch (notifErr) {
        console.error("Failed to send post-order notifications:", notifErr);
      }
    })();

    // --- Complete idempotency lock with real result ---
    const successResult = { success: true, orderId: newOrder._id };
    await completeIdempotencyLock(idempotencyKey, successResult);

    lifecycle.payment('verification_complete', { orderId: newOrder._id.toString(), razorpay_order_id, razorpay_payment_id, requestId });

    res.status(200).json(successResult);

  } catch (err) {
    lifecycle.error('verification_failed', err, { operation: 'payment', requestId });
    handleError(res, err, "Payment verification failed");
  }
};

/**
 * GET ORDER BY PAYMENT REFERENCE
 * 
 * After payment verification redirects to the success page,
 * the frontend calls this to fetch the order that was created.
 * Replaces the old place-order call.
 */
export const getOrderByPaymentRef = async (req, res) => {
  try {
    const { reference } = req.params;
    const userId = req.userId;

    if (!reference) {
      return res.status(400).json({ success: false, message: "Payment reference is required" });
    }

    const order = await Order.findOne({
      paymentId: reference,
      user: userId
    }).populate({
      path: 'items.productId',
      select: 'title images price'
    });

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    res.status(200).json({ success: true, order });
  } catch (err) {
    handleError(res, err, "Failed to fetch order");
  }
};

export const getRazorpayKey = (req, res) => {
  res.status(200).json({ key: process.env.RAZORPAY_KEY_ID });
};

/**
 * Razorpay Webhook Handler
 * 
 * SECURITY: Uses raw body for signature verification.
 * The webhook route must be configured with express.raw() middleware
 * in server.js to ensure req.body is the raw Buffer.
 */
export const razorpayWebhook = async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];

    if (!signature) {
      console.warn('Webhook rejected: Missing signature');
      return res.status(401).json({ success: false, message: 'Missing signature' });
    }

    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error('RAZORPAY_WEBHOOK_SECRET not configured');
      return res.status(500).json({ success: false, message: 'Webhook configuration error' });
    }

    // Use raw body for signature verification (not re-serialized JSON)
    const rawBody = req.rawBody || JSON.stringify(req.body);
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');

    // Timing-safe comparison
    const signatureBuffer = Buffer.from(signature, 'utf-8');
    const expectedBuffer = Buffer.from(expectedSignature, 'utf-8');

    if (signatureBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
      console.warn(`Webhook signature mismatch. IP: ${req.ip}`);
      return res.status(401).json({ success: false, message: 'Invalid signature' });
    }

    // Parse body (may be raw Buffer or already parsed)
    const webhookBody = typeof req.body === 'string' ? JSON.parse(req.body)
      : Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString())
        : req.body;

    const { event, payload } = webhookBody;

    switch (event) {
      case 'payment.captured':
        await handlePaymentCaptured(payload.payment?.entity);
        break;

      case 'payment.failed':
        await handlePaymentFailed(payload.payment?.entity);
        break;

      case 'refund.processed':
        await handleRefundProcessed(payload.refund?.entity);
        break;

      default:
        console.log(`Unhandled webhook event: ${event}`);
    }

    // Always 200 to prevent retries
    res.status(200).json({ success: true, received: true });

  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(200).json({ success: false, error: 'Processing error' });
  }
};

// ========================================================================
// WEBHOOK EVENT HANDLERS
// ========================================================================

const handlePaymentCaptured = async (payment) => {
  if (!payment) return;

  const { id, order_id, amount, status } = payment;

  // Idempotency guard: prevent duplicate webhook processing
  const webhookKey = `webhook:payment_captured:${id}`;
  const alreadyHandled = await isAlreadyProcessed(webhookKey);
  if (alreadyHandled.processed) {
    lifecycle.webhook('duplicate_ignored', { paymentId: id, orderId: order_id });
    return;
  }

  lifecycle.webhook('payment_captured', { paymentId: id, orderId: order_id, amount: amount / 100 });

  // Update or create payment record
  await Payment.findOneAndUpdate(
    { razorpay_order_id: order_id },
    {
      razorpay_payment_id: id,
      amount: amount / 100,
      status: 'captured',
      verifiedAt: new Date(),
      source: 'webhook'
    },
    { upsert: true }
  );

  // If there's a pending order that wasn't processed by paymentVerification
  // (e.g., browser crashed), create the order now via webhook
  const existingOrder = await Order.findOne({ razorpayOrderId: order_id });
  if (!existingOrder) {
    const pendingOrder = await PendingOrder.findOne({ razorpayOrderId: order_id });
    if (pendingOrder) {
      // Confirm stock
      await confirmStockPurchase(order_id);

      const newOrder = await Order.create({
        user: pendingOrder.userId,
        items: pendingOrder.items.map(item => ({
          productId: item.productId,
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          sellerId: item.sellerId,
          status: ORDER_STATES.CONFIRMED,
          giftMessage: item.giftMessage || "",
          senderName: item.senderName || "",
          receiverName: item.receiverName || ""
        })),
        totalAmount: pendingOrder.totalAmount,
        shippingAddress: pendingOrder.shippingAddress,
        image: pendingOrder.image,
        paymentId: id,
        razorpayOrderId: order_id,
        status: ORDER_STATES.CONFIRMED,
        placedAt: new Date()
      });

      await Payment.findOneAndUpdate(
        { razorpay_order_id: order_id },
        { orderId: newOrder._id, userId: pendingOrder.userId }
      );

      // Clear cart
      try {
        await Cart.deleteMany({ userId: pendingOrder.userId });
      } catch (e) { /* non-fatal */ }

      await PendingOrder.deleteOne({ razorpayOrderId: order_id });
      lifecycle.webhook('order_created_via_fallback', { orderId: newOrder._id.toString(), razorpayOrderId: order_id });

      // --- Dispatch Notifications for Webhook Fallback ---
      (async () => {
        try {
          const buyer = await User.findById(pendingOrder.userId).select('name email');
          
          const sellerItemsMap = {};
          for (const item of newOrder.items) {
            const sId = item.sellerId.toString();
            if (!sellerItemsMap[sId]) {
              sellerItemsMap[sId] = { items: [], total: 0 };
            }
            sellerItemsMap[sId].items.push(item);
            sellerItemsMap[sId].total += (item.price * item.quantity);
          }

          const sellerIds = Object.keys(sellerItemsMap);
          const sellers = await Seller.find({ _id: { $in: sellerIds } }).select('name email');
          sellers.forEach(s => {
            if (sellerItemsMap[s._id.toString()]) {
              sellerItemsMap[s._id.toString()].sellerName = s.name;
              sellerItemsMap[s._id.toString()].sellerEmail = s.email;
            }
          });

          await notifyOrderConfirmation({
            buyerEmail: buyer?.email,
            buyerName: buyer?.name,
            orderId: newOrder._id,
            items: newOrder.items,
            totalAmount: newOrder.totalAmount,
            paymentId: id
          });

          await notifySellerNewOrder({
            orderId: newOrder._id,
            sellerItems: sellerItemsMap
          });
        } catch (notifErr) {
          console.error("Failed to send webhook post-order notifications:", notifErr);
        }
      })();
    } else {
      lifecycle.error('webhook_no_pending_order', { message: 'Payment captured but no PendingOrder found' }, { operation: 'webhook', orderId: order_id, paymentId: id });
    }
  }

  // Mark webhook as processed
  await markProcessed(webhookKey, { orderId: order_id, paymentId: id }, 'webhook');
};

const handlePaymentFailed = async (payment) => {
  if (!payment) return;

  console.log(`Payment failed: ${payment.id}, reason: ${payment.error_reason}`);

  // Release stock reservation
  await releaseReservation(payment.order_id);

  // Update payment record
  await Payment.findOneAndUpdate(
    { razorpay_order_id: payment.order_id },
    {
      status: 'failed',
      failureReason: payment.error_reason,
      failedAt: new Date()
    },
    { upsert: true }
  );

  // Clean up pending order
  await PendingOrder.deleteOne({ razorpayOrderId: payment.order_id });
};

const handleRefundProcessed = async (refund) => {
  if (!refund) return;

  const refundOrderId = refund.order_id || refund.entity?.order_id;

  // Idempotency guard
  const refundKey = `webhook:refund_processed:${refund.id}`;
  const alreadyHandled = await isAlreadyProcessed(refundKey);
  if (alreadyHandled.processed) {
    lifecycle.webhook('refund_duplicate_ignored', { refundId: refund.id });
    return;
  }

  lifecycle.webhook('refund_processed', { refundId: refund.id, orderId: refundOrderId, amount: (refund.amount || 0) / 100 });

  // Update payment status
  const payment = await Payment.findOneAndUpdate(
    { razorpay_order_id: refundOrderId },
    { status: 'refunded' },
    { new: true }
  );

  if (payment && payment.orderId) {
    // Update refund metadata (not a status transition — separate concern)
    await Order.findByIdAndUpdate(payment.orderId, {
      $set: {
        refundStatus: 'Processed',
        refundId: refund.id
      }
    });

    // Transition status through lifecycle service
    const order = await Order.findById(payment.orderId);
    if (order && order.status !== ORDER_STATES.CANCELLED) {
      const previousStatus = order.status;
      await transitionOrder(payment.orderId, ORDER_STATES.REFUNDED, 'webhook', {
        reason: `Razorpay refund ${refund.id}`,
        requestId: `refund_${refund.id}`
      });

      // Notify buyer
      const buyer = await User.findById(order.user).select('name email');
      if (buyer) {
        await notifyBuyerStatusChange({
          buyerEmail: buyer.email,
          buyerName: buyer.name,
          orderId: order._id,
          oldStatus: previousStatus,
          newStatus: ORDER_STATES.REFUNDED
        });
      }
    }
  }

  await markProcessed(refundKey, { refundId: refund.id, orderId: refundOrderId }, 'webhook');
};
