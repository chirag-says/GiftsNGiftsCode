import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema({
  razorpay_order_id: {
    type: String,
    required: true,
    index: true
  },
  razorpay_payment_id: {
    type: String,
    sparse: true,
    index: true
  },
  razorpay_signature: {
    type: String
  },
  amount: {
    type: Number
  },
  currency: {
    type: String,
    default: 'INR'
  },
  status: {
    type: String,
    enum: ['created', 'captured', 'failed', 'refunded'],
    default: 'created'
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'user'
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'order'
  },
  verifiedAt: {
    type: Date
  },
  failureReason: {
    type: String
  },
  failedAt: {
    type: Date
  },
  source: {
    type: String,
    enum: ['client', 'webhook'],
    default: 'client'
  },
  stockConfirmed: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

export default mongoose.model("payment", paymentSchema);