/**
 * Pending Order Model
 * 
 * PURPOSE: Stores order data (shipping address, items, gift messages) at checkout time.
 * When payment is verified, this data is used to create the real Order.
 * This solves the problem where order data was only available during the
 * place-order call (which happened AFTER payment), creating a gap where
 * payment could succeed but the order never gets created.
 * 
 * LIFECYCLE:
 *   checkout() → creates PendingOrder
 *   paymentVerification() → reads PendingOrder → creates real Order → deletes PendingOrder
 *   cleanupExpiredReservations() → deletes expired PendingOrders
 */

import mongoose from "mongoose";

const pendingOrderSchema = new mongoose.Schema({
  razorpayOrderId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'user',
    required: true
  },
  items: [
    {
      productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
      name: { type: String, required: true },
      quantity: { type: Number, required: true },
      price: { type: Number, required: true },
      sellerId: { type: mongoose.Schema.Types.ObjectId, ref: "Seller", required: true },
      giftMessage: { type: String, default: "" },
      senderName: { type: String, default: "" },
      receiverName: { type: String, default: "" }
    }
  ],
  totalAmount: {
    type: Number,
    required: true
  },
  shippingAddress: {
    name: String,
    pin: Number,
    city: String,
    state: String,
    phone: String,
    alternatephone: String,
    address: String
  },
  image: {
    type: String,
    default: ""
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expires: 0 } // MongoDB TTL index — auto-deletes expired docs
  }
}, {
  timestamps: true
});

const PendingOrder = mongoose.models.PendingOrder || mongoose.model("PendingOrder", pendingOrderSchema);
export default PendingOrder;
