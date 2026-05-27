import express from "express";
import authseller from "../middleware/authseller.js";
import {
  addproducts,
  getSeller,
  getSellerDashboardStats,
  getSellerOrders,
  getSellerProfile,
  loginseller,
  registerseller,
  updateSellerOrderStatus,
  processReturn,
  updateSellerProfile,
  getSellerEarnings,
  getSellerCustomers,
  verifyOtp,
  getSellerNotifications,
  markSellerNotificationRead,
  // New Auth Features
  resendVerificationOtp,
  sellerForgotPassword,
  sellerResetPassword,
  isSellerAuthenticated,
  logoutSeller
} from "../controller/sellercontroller.js";
import { secureUpload } from "../middleware/multer.js";

const sellerrouter = express.Router();

// ========================= AUTH ROUTES (Public) =========================
sellerrouter.post('/register', registerseller);
sellerrouter.post("/login", loginseller);
sellerrouter.post("/verify-otp", verifyOtp);
sellerrouter.post("/resend-otp", resendVerificationOtp);        // NEW: Resend verification OTP
sellerrouter.post("/forgot-password", sellerForgotPassword);    // NEW: Forgot password
sellerrouter.post("/reset-password", sellerResetPassword);      // NEW: Reset password

// ========================= PROTECTED ROUTES (Require Auth) =========================
// Auth Check & Logout
sellerrouter.get("/is-authenticated", authseller, isSellerAuthenticated);  // Check if authenticated
sellerrouter.post("/logout", logoutSeller);  // NEW: Logout (clears cookie)

// Products
sellerrouter.post("/addproducts", authseller, ...secureUpload.array('images', 5), addproducts);

// Profile
sellerrouter.get("/profile", authseller, getSellerProfile);
sellerrouter.post(
  "/updateprofile",
  authseller,
  ...secureUpload.single("image"),
  updateSellerProfile
);
sellerrouter.get("/sellerdetails", authseller, getSeller);

// Orders
sellerrouter.get("/orders", authseller, getSellerOrders);
sellerrouter.get('/dashboard-stats', authseller, getSellerDashboardStats);
sellerrouter.put("/orders/:orderId", authseller, updateSellerOrderStatus);
sellerrouter.put("/orders/:orderId/return", authseller, processReturn);

// Finance
sellerrouter.get("/finance/earnings", authseller, getSellerEarnings);

// Customers
sellerrouter.get("/customers/my-customers", authseller, getSellerCustomers);

// Notifications
sellerrouter.get("/notifications", authseller, getSellerNotifications);
sellerrouter.put("/notifications/:id/read", authseller, markSellerNotificationRead);

export default sellerrouter;