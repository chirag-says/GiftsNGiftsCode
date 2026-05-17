import express from "express";
import {
  checkout,
  paymentVerification,
  getRazorpayKey,
  razorpayWebhook,
  getOrderByPaymentRef
} from "../controller/paymentController.js";
import userAuth from "../middleware/userAuth.js";

const router = express.Router();

// Protected routes (require user authentication)
router.post("/checkout", userAuth, checkout);
router.get("/getkey", userAuth, getRazorpayKey);

// Payment verification — requires auth (Issue #2 fix)
// The Razorpay signature is a second layer of defense
router.post("/paymentVerification", userAuth, paymentVerification);

// Get order after payment (replaces old place-order call)
router.get("/order-by-payment/:reference", userAuth, getOrderByPaymentRef);

// Webhook endpoint — NO userAuth (server-to-server from Razorpay)
// Security handled via HMAC signature verification in controller
router.post("/webhook/razorpay", razorpayWebhook);

export default router;
