/**
 * Client Controller
 * 
 * SECURITY HARDENED:
 * - IDOR Protection on all order operations
 * - NoSQL Injection prevention
 * - ReDoS-safe search
 * - Uses req.userId from auth middleware (never req.body.userId)
 * 
 * NOTE: placeorder was REMOVED in Sprint 1. Order creation now happens
 * atomically inside paymentVerification (paymentController.js).
 * This eliminates the double stock deduction bug.
 */

import addproductmodel from "../model/addproduct.js";
import Category from "../model/Category.js";
import orderModel from "../model/order.js";
import sellermodel from "../model/sellermodel.js";
import {
  handleError,
  isValidObjectId,
  createSafeSearchRegex,
  sanitizeForMongo
} from "../utils/errorHandler.js";
import usermodel from "../model/mongobd_usermodel.js";
import { processFullRefund } from '../services/refundService.js';
import { restoreCancelledStock } from '../services/stockReservationService.js';
import { notifyBuyerStatusChange } from '../services/notificationService.js';
import SellerNotification from "../model/sellerNotification.js";

/**
 * Get list of all available products
 * Excludes products from: holiday mode sellers, suspended sellers, blocked sellers
 */
export const productlist = async (req, res) => {
  try {
    // Issue #39 fix: Pagination support
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 40));
    const skip = (page - 1) * limit;

    // Get IDs of unavailable sellers
    const unavailableSellers = await sellermodel.find({
      $or: [
        { holidayMode: true },
        { status: 'Suspended' },
        { isBlocked: true }
      ]
    }).select('_id');

    const unavailableSellerIds = unavailableSellers.map(s => s._id);

    const categories = await Category.find();

    const filter = {
      sellerId: { $nin: unavailableSellerIds },
      approved: true,
      isAvailable: true
    };

    // Get total count and paginated products in parallel
    const [totalProducts, products] = await Promise.all([
      addproductmodel.countDocuments(filter),
      addproductmodel.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
    ]);

    res.status(200).json({
      success: true,
      products,
      categories,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalProducts / limit),
        totalProducts,
        perPage: limit
      }
    });
  } catch (error) {
    handleError(res, error, "Failed to fetch products");
  }
};

/**
 * Get all products organized by category
 */
export const getAllProductsByCategory = async (req, res) => {
  try {
    // Get unavailable sellers
    const unavailableSellers = await sellermodel.find({
      $or: [
        { holidayMode: true },
        { status: 'Suspended' },
        { isBlocked: true }
      ]
    }).select('_id');
    const unavailableSellerIds = unavailableSellers.map(s => s._id);

    const categories = await Category.find();
    const result = await Promise.all(
      categories.map(async (category) => {
        const products = await addproductmodel.find({
          categoryname: category._id,
          sellerId: { $nin: unavailableSellerIds }
        });
        return { category: category.categoryname, products };
      })
    );

    res.status(200).json({ success: true, categories: result });
  } catch (error) {
    handleError(res, error, "Failed to fetch products by category");
  }
};

/**
 * Get User's Orders
 * 
 * SECURITY:
 * - Uses req.userId from auth middleware exclusively
 * - IDOR Protection: Users can only see their own orders
 */
export const getUserOrders = async (req, res) => {
  try {
    const userId = req.userId; // Securely from middleware

    if (!userId) {
      return res.status(401).json({ success: false, message: "Auth required" });
    }

    const orders = await orderModel
      .find({ user: userId })
      .populate({
        path: "items.productId",
        select: "title images price" // Fetch only necessary product fields
      })
      .sort({ placedAt: -1 });

    res.status(200).json({ success: true, orders });
  } catch (error) {
    handleError(res, error, "Failed to fetch orders");
  }
};

/**
 * Get Single Order by ID
 */
export const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid ID" });
    }

    const order = await orderModel.findOne({ _id: id, user: userId })
      .populate("items.productId");

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    res.status(200).json({ success: true, order });
  } catch (error) {
    handleError(res, error, "Failed to fetch order details");
  }
};

/**
 * Search Products
 * 
 * SECURITY:
 * - ReDoS Protection: Escapes regex special characters
 * - NoSQL Injection Prevention: Sanitizes query input
 * - Limits search term length
 */

const extractPriceRange = (text) => {
  const lower = text.toLowerCase();

  const betweenMatch = lower.match(/(\d+)\s*(to|-)\s*(\d+)/);
  if (betweenMatch) {
    return { min: +betweenMatch[1], max: +betweenMatch[3] };
  }

  const underMatch = lower.match(/(under|below)\s*(\d+)/);
  if (underMatch) {
    return { min: 0, max: +underMatch[2] };
  }

  const aboveMatch = lower.match(/(above|over)\s*(\d+)/);
  if (aboveMatch) {
    return { min: +aboveMatch[2], max: 1000000 };
  }

  return null;
};
const cleanSearchText = (text) => {
  return text
    .toLowerCase()
    .replace(/under\s*\d+/g, "")
    .replace(/below\s*\d+/g, "")
    .replace(/above\s*\d+/g, "")
    .replace(/\d+\s*(to|-)\s*\d+/g, "")
    .trim();
};
export const getSearchProduct = async (req, res) => {
  try {
    const rawSearchText = (req.query.query || "").trim();

    // 1. Unavailable sellers
    const unavailableSellers = await sellermodel.find({
      $or: [
        { holidayMode: true },
        { status: "Suspended" },
        { isBlocked: true }
      ]
    }).select("_id");

    const unavailableSellerIds = unavailableSellers.map(s => s._id);

    // 2. Base query
    let mongoQuery = {
      sellerId: { $nin: unavailableSellerIds }
    };

    // 3. Price filter
    const priceRange = extractPriceRange(rawSearchText);
    if (priceRange) {
      mongoQuery.price = {
        $gte: priceRange.min,
        $lte: priceRange.max
      };
    }

    // 4. Clean text (category / title)
    const keyword = cleanSearchText(rawSearchText);

    // 5. Text search — use safe regex
    if (keyword) {
      const regex = createSafeSearchRegex(keyword);
      if (regex) {
        mongoQuery.$or = [
          { title: regex },
          { description: regex },
          { brand: regex }
        ];
      }
    }

    // 6. Fetch products
    const products = await addproductmodel
      .find(mongoQuery)
      .populate("categoryname", "categoryname")
      .populate("subcategory", "name")
      .limit(200);

    // 7. Final filter (category + title)
    const finalProducts = products.filter(p => {
      const cat = p.categoryname?.categoryname?.toLowerCase() || "";
      const sub = p.subcategory?.name?.toLowerCase() || "";
      const title = p.title?.toLowerCase() || "";

      return (
        !keyword ||
        cat.includes(keyword) ||
        sub.includes(keyword) ||
        title.includes(keyword)
      );
    });

    res.status(200).json({
      success: true,
      data: finalProducts
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Search failed"
    });
  }
};

/**
 * Validate Stock Availability
 * 
 * SECURITY:
 * - Uses req.userId for authentication verification
 * - Validates all productIds
 */
export const validateStock = async (req, res) => {
  try {
    // SECURITY: Require authentication
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required"
      });
    }

    const { items } = req.body;

    if (!items || !Array.isArray(items) || !items.length) {
      return res.status(400).json({
        success: false,
        message: "No items to validate"
      });
    }

    // Limit items to prevent DoS
    if (items.length > 50) {
      return res.status(400).json({
        success: false,
        message: "Too many items to validate"
      });
    }

    for (const item of items) {
      // SECURITY: Validate ObjectId format
      if (!isValidObjectId(item.productId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid product ID format"
        });
      }

      const product = await addproductmodel.findById(item.productId).populate('sellerId');

      if (!product) {
        return res.status(404).json({
          success: false,
          message: `Product not found: ${item.name || 'Unknown'}`
        });
      }

      // Check seller status
      const seller = product.sellerId;
      if (seller && (seller.holidayMode || seller.status === 'Suspended' || seller.isBlocked)) {
        return res.status(400).json({
          success: false,
          message: `Seller for "${product.title}" is currently unavailable.`
        });
      }

      const quantity = parseInt(item.quantity) || 0;
      if (product.stock < quantity) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for ${product.title}. Available: ${product.stock}`
        });
      }
    }

    res.status(200).json({ success: true, message: "Stock available" });
  } catch (error) {
    handleError(res, error, "Stock validation failed");
  }
};

/**
 * Cancel Order
 * Allows a buyer to cancel their order if it hasn't been shipped yet.
 * Initiates Razorpay refund and restores stock.
 */
export const cancelOrder = async (req, res) => {
  try {
    const userId = req.userId;
    const { id } = req.params;
    const { reason } = req.body;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid order ID" });
    }

    const order = await orderModel.findOne({ _id: id, user: userId });

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    // Check if cancellation is allowed
    const nonCancellableStatuses = ["Shipped", "Delivered", "Cancelled"];
    if (nonCancellableStatuses.includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: `Order cannot be cancelled because its status is '${order.status}'.`
      });
    }

    // 1. Process Refund (if payment was made)
    if (order.paymentId) {
      const refundResult = await processFullRefund(order.paymentId);
      if (refundResult.success) {
        order.refundStatus = "Processed";
        order.refundId = refundResult.refundId;
      } else {
        // We log the error but still cancel the order locally to prevent shipping
        console.error(`Refund failed for order ${order._id}:`, refundResult.error);
        order.refundStatus = "Failed";
      }
    }

    // 2. Update Order Status
    order.status = "Cancelled";
    order.cancellationReason = reason || "Customer requested cancellation";
    
    // Update all item statuses
    order.items.forEach(item => {
      item.status = "Cancelled";
      item.cancellationReason = reason;
    });

    await order.save();

    // 3. Restore Stock
    const itemsToRestore = order.items.map(item => ({
      productId: item.productId,
      quantity: item.quantity
    }));
    await restoreCancelledStock(itemsToRestore);

    // 4. Notify Buyer & Sellers (Fire and Forget)
    (async () => {
      try {
        const buyer = await usermodel.findById(userId).select('name email');
        
        // Notify buyer
        if (buyer) {
          await notifyBuyerStatusChange({
            buyerEmail: buyer.email,
            buyerName: buyer.name,
            orderId: order._id,
            oldStatus: order.status,
            newStatus: "Cancelled"
          });
        }

        // Notify each unique seller
        const sellerIds = [...new Set(order.items.map(item => item.sellerId.toString()))];
        for (const sellerId of sellerIds) {
          await SellerNotification.create({
            sellerId,
            title: "Order Cancelled ❌",
            message: `Order #${String(order._id).slice(-8)} was cancelled by the customer. Reason: ${reason || 'N/A'}. Stock has been restored.`,
            category: "orders",
            severity: "warning",
            metadata: { orderId: order._id, reason }
          });
        }
      } catch (notifErr) {
        console.error("Cancellation notifications failed:", notifErr);
      }
    })();

    res.status(200).json({
      success: true,
      message: "Order cancelled successfully",
      order
    });

  } catch (error) {
    handleError(res, error, "Failed to cancel order");
  }
};

/**
 * Request Return
 * Allows a buyer to request a return for a delivered order within a return window.
 */
export const requestReturn = async (req, res) => {
  try {
    const userId = req.userId;
    const { id } = req.params;
    const { reason, itemId } = req.body;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid order ID" });
    }

    const order = await orderModel.findOne({ _id: id, user: userId });
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    // Usually returns are for specific items, but we can do order-level or item-level
    if (itemId && isValidObjectId(itemId)) {
      const item = order.items.find(i => i._id.toString() === itemId);
      if (!item) return res.status(404).json({ success: false, message: "Item not found in order" });
      
      if (item.status !== "Delivered") {
        return res.status(400).json({ success: false, message: "Only delivered items can be returned" });
      }
      
      item.returnStatus = "Requested";
      item.returnReason = reason || "Customer requested return";
    } else {
      if (order.status !== "Delivered") {
        return res.status(400).json({ success: false, message: "Only delivered orders can be returned" });
      }
      
      // Order level return
      order.items.forEach(item => {
        if (item.status === "Delivered") {
          item.returnStatus = "Requested";
          item.returnReason = reason || "Customer requested return";
        }
      });
    }

    await order.save();

    // Notify sellers
    (async () => {
      try {
        const sellerIds = [...new Set(order.items.map(item => item.sellerId.toString()))];
        for (const sellerId of sellerIds) {
          await SellerNotification.create({
            sellerId,
            title: "Return Requested ↩️",
            message: `A return was requested for Order #${String(order._id).slice(-8)}. Reason: ${reason || 'N/A'}. Please review.`,
            category: "orders",
            severity: "warning",
            metadata: { orderId: order._id, reason }
          });
        }
      } catch (notifErr) {
        console.error("Return request notifications failed:", notifErr);
      }
    })();

    res.status(200).json({
      success: true,
      message: "Return requested successfully",
      order
    });

  } catch (error) {
    handleError(res, error, "Failed to request return");
  }
};