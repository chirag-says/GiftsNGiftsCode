import mongoose from "mongoose";

const orderSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
    required: true,
  },
  items: [
    {
      productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
      name: String,
      quantity: { type: Number, required: true },
      price: { type: Number, required: true },
      sellerId: { type: mongoose.Schema.Types.ObjectId, ref: "Seller", required: true },
      status: { type: String, default: "Pending" }, // Per-item status
      giftMessage: {
        type: String,
        default: ""
      },
      senderName: {
        type: String,
        default: ""
      },
      receiverName: {
        type: String,
        default: ""
      },
      cancellationReason: { type: String, default: "" },
      returnReason: { type: String, default: "" },
      returnStatus: { type: String, enum: ["None", "Requested", "Approved", "Rejected", "Received"], default: "None" },
      refundStatus: { type: String, enum: ["None", "Pending", "Processed", "Failed"], default: "None" },
      refundId: { type: String, default: null } // Razorpay refund ID
    },
  ],
  totalAmount: { type: Number, required: true },
  shippingAddress: {
    name: String,
    pin: Number,
    city: String,
    state: String,
    phone: String,
    alternatephone: String,
    address: String
  },
  status: { type: String, default: "Pending" },
  placedAt: { type: Date, default: Date.now },
  image: { type: String },
  paymentId: { type: String, default: null },
  razorpayOrderId: { type: String, index: true },
  cancellationReason: { type: String, default: "" },
  refundStatus: { type: String, enum: ["None", "Pending", "Processed", "Failed"], default: "None" },
  refundId: { type: String, default: null }
}, {
  timestamps: true
});

// ⭐ Performance Tuning: Add indexes for frequently queried fields
orderSchema.index({ user: 1 });
orderSchema.index({ "items.sellerId": 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ placedAt: -1 });

const orderModel = mongoose.models.order || mongoose.model("order", orderSchema);
export default orderModel;
