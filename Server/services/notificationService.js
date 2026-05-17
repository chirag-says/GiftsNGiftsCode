/**
 * Notification Service — Central notification dispatcher
 * 
 * DESIGN: All notification calls are fire-and-forget. They NEVER throw errors
 * that would disrupt the main business operation. Failed notifications are logged
 * and can be retried later.
 * 
 * RULE #19 (CODING_STANDARDS): Every state change that affects a user must
 * trigger a notification.
 */
import { sendEmail } from "../config/mail.js";
import SellerNotification from "../model/sellerNotification.js";

// ==================== ORDER LIFECYCLE ====================

/**
 * Notify buyer: order confirmed after payment
 * Called from: paymentController.paymentVerification (after Order.create)
 * 
 * @param {Object} params
 * @param {string} params.buyerEmail
 * @param {string} params.buyerName
 * @param {string} params.orderId
 * @param {Array}  params.items - [{name, quantity, price}]
 * @param {number} params.totalAmount
 * @param {string} params.paymentId
 */
export const notifyOrderConfirmation = async ({
  buyerEmail, buyerName, orderId, items, totalAmount, paymentId
}) => {
  try {
    if (!buyerEmail) {
      console.warn("[Notification] Skipped order confirmation — no buyer email");
      return;
    }

    const itemRows = items.map(item =>
      `<tr>
        <td style="padding:8px;border-bottom:1px solid #eee">${item.name}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;text-align:center">${item.quantity}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">₹${item.price}</td>
      </tr>`
    ).join("");

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <div style="background:#2C1A0F;padding:20px;text-align:center">
          <h1 style="color:#d4af37;margin:0">GiftsNGifts</h1>
        </div>
        <div style="padding:24px">
          <h2 style="color:#333">Order Confirmed! 🎉</h2>
          <p>Hi ${buyerName || "Customer"},</p>
          <p>Your order has been placed successfully.</p>
          
          <table style="width:100%;border-collapse:collapse;margin:16px 0">
            <thead>
              <tr style="background:#f8f8f8">
                <th style="padding:8px;text-align:left">Item</th>
                <th style="padding:8px;text-align:center">Qty</th>
                <th style="padding:8px;text-align:right">Price</th>
              </tr>
            </thead>
            <tbody>${itemRows}</tbody>
          </table>
          
          <p style="font-size:18px;font-weight:bold;text-align:right">
            Total: ₹${totalAmount}
          </p>
          
          <p style="color:#666;font-size:12px">
            Order ID: ${orderId}<br>
            Payment ID: ${paymentId}
          </p>
        </div>
        <div style="background:#f8f8f8;padding:12px;text-align:center;font-size:12px;color:#999">
          Thank you for shopping with GiftsNGifts!
        </div>
      </div>
    `;

    await sendEmail(buyerEmail, `Order Confirmed — #${String(orderId).slice(-8)}`, html);
  } catch (err) {
    // CRITICAL: Never let notification failure crash the order flow
    console.error("[Notification] Order confirmation email failed:", err.message);
  }
};

/**
 * Notify seller(s): new order received
 * Called from: paymentController.paymentVerification (after Order.create)
 * 
 * @param {Object} params
 * @param {string} params.orderId
 * @param {Array}  params.sellerItems - Map<sellerId, {sellerEmail, sellerName, items}>
 */
export const notifySellerNewOrder = async ({ orderId, sellerItems }) => {
  try {
    for (const [sellerId, data] of Object.entries(sellerItems)) {
      // In-app notification (always works, even if email fails)
      try {
        await SellerNotification.create({
          sellerId,
          title: "New Order Received! 🛍️",
          message: `You have a new order (#${String(orderId).slice(-8)}) with ${data.items.length} item(s). Total: ₹${data.total}`,
          category: "orders",
          severity: "info",
          metadata: { orderId, itemCount: data.items.length, total: data.total }
        });
      } catch (dbErr) {
        console.error(`[Notification] In-app notification failed for seller ${sellerId}:`, dbErr.message);
      }

      // Email notification
      if (data.sellerEmail) {
        try {
          const itemList = data.items.map(i => `<li>${i.name} × ${i.quantity} — ₹${i.price}</li>`).join("");
          await sendEmail(
            data.sellerEmail,
            `New Order — #${String(orderId).slice(-8)}`,
            `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
              <h2>New Order Received! 🛍️</h2>
              <p>Hi ${data.sellerName || "Seller"},</p>
              <p>You have a new order to fulfill:</p>
              <ul>${itemList}</ul>
              <p><strong>Total: ₹${data.total}</strong></p>
              <p>Please log in to your seller dashboard to process this order.</p>
            </div>`
          );
        } catch (emailErr) {
          console.error(`[Notification] Seller email failed for ${sellerId}:`, emailErr.message);
        }
      }
    }
  } catch (err) {
    console.error("[Notification] Seller new order notification failed:", err.message);
  }
};

/**
 * Notify buyer: order status changed
 * Called from: sellercontroller.updateSellerOrderStatus (after order.save)
 * 
 * @param {Object} params
 * @param {string} params.buyerEmail
 * @param {string} params.buyerName
 * @param {string} params.orderId
 * @param {string} params.oldStatus
 * @param {string} params.newStatus
 */
export const notifyBuyerStatusChange = async ({
  buyerEmail, buyerName, orderId, oldStatus, newStatus
}) => {
  try {
    if (!buyerEmail) {
      console.warn("[Notification] Skipped status change — no buyer email");
      return;
    }

    const statusMessages = {
      'Processing': 'Your order is being prepared by the seller.',
      'Shipped': 'Your order has been shipped and is on its way! 📦',
      'Out for Delivery': 'Your order is out for delivery today! 🚚',
      'Delivered': 'Your order has been delivered! We hope you love it! 🎁',
      'Cancelled': 'Your order has been cancelled. If you didn\'t request this, please contact support.'
    };

    const statusEmoji = {
      'Processing': '⚙️',
      'Shipped': '📦',
      'Out for Delivery': '🚚',
      'Delivered': '🎁',
      'Cancelled': '❌'
    };

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <div style="background:#2C1A0F;padding:20px;text-align:center">
          <h1 style="color:#d4af37;margin:0">GiftsNGifts</h1>
        </div>
        <div style="padding:24px">
          <h2>${statusEmoji[newStatus] || '📋'} Order Update</h2>
          <p>Hi ${buyerName || "Customer"},</p>
          <p>${statusMessages[newStatus] || `Your order status has been updated to: ${newStatus}`}</p>
          <p style="background:#f0f0f0;padding:12px;border-radius:8px;text-align:center;font-size:18px;font-weight:bold">
            ${newStatus}
          </p>
          <p style="color:#666;font-size:12px">Order ID: ${orderId}</p>
        </div>
      </div>
    `;

    await sendEmail(buyerEmail, `Order ${newStatus} — #${String(orderId).slice(-8)}`, html);
  } catch (err) {
    console.error("[Notification] Status change email failed:", err.message);
  }
};

// ==================== SELLER LIFECYCLE ====================

/**
 * Notify seller: account approved/disapproved by admin
 * Called from: admincontroller.toggleApprove
 * 
 * @param {Object} params
 * @param {string} params.sellerEmail
 * @param {string} params.sellerName
 * @param {boolean} params.isApproved
 */
export const notifySellerApprovalChange = async ({ sellerEmail, sellerName, sellerId, isApproved }) => {
  try {
    // In-app notification
    try {
      await SellerNotification.create({
        sellerId,
        title: isApproved ? "Account Approved! ✅" : "Account Suspended ⚠️",
        message: isApproved
          ? "Your seller account has been approved. You can now list products and start selling!"
          : "Your seller account has been suspended. Please contact support for details.",
        category: "system",
        severity: isApproved ? "info" : "critical",
        metadata: { action: isApproved ? "approved" : "disapproved" }
      });
    } catch (dbErr) {
      console.error("[Notification] In-app seller approval notification failed:", dbErr.message);
    }

    // Email notification
    if (sellerEmail) {
      const html = isApproved
        ? `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
            <div style="background:#2C1A0F;padding:20px;text-align:center">
              <h1 style="color:#d4af37;margin:0">GiftsNGifts</h1>
            </div>
            <div style="padding:24px">
              <h2>🎉 Congratulations, ${sellerName || "Seller"}!</h2>
              <p>Your seller account has been <strong>approved</strong>.</p>
              <p>You can now:</p>
              <ul>
                <li>List your products</li>
                <li>Manage orders</li>
                <li>Track your earnings</li>
              </ul>
              <p>Log in to your seller dashboard to get started.</p>
            </div>
          </div>`
        : `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
            <div style="background:#2C1A0F;padding:20px;text-align:center">
              <h1 style="color:#d4af37;margin:0">GiftsNGifts</h1>
            </div>
            <div style="padding:24px">
              <h2>⚠️ Account Update</h2>
              <p>Hi ${sellerName || "Seller"},</p>
              <p>Your seller account has been <strong>suspended</strong>.</p>
              <p>If you believe this is an error, please contact our support team.</p>
            </div>
          </div>`;

      await sendEmail(
        sellerEmail,
        isApproved ? "Seller Account Approved! 🎉" : "Seller Account Suspended",
        html
      );
    }
  } catch (err) {
    console.error("[Notification] Seller approval notification failed:", err.message);
  }
};
