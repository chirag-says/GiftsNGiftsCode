/**
 * Client Routes
 * 
 * SECURITY HARDENED:
 * - All protected routes require userAuth middleware
 * - Input validation via Zod schemas
 * - IDOR protection in controllers
 * 
 * NOTE: /place-order route REMOVED in Sprint 1.
 * Order creation now happens atomically during payment verification.
 * See paymentRoutes.js → /paymentVerification
 */

import express from "express";
import {
  productlist,
  getAllProductsByCategory,
  getUserOrders,
  getOrderById,
  getSearchProduct,
  validateStock,
  cancelOrder,
  requestReturn
} from "../controller/clientcontroller.js";

import userAuth from "../middleware/userAuth.js";
import {
  validate,
  validateId,
  searchQuerySchema,
  validateStockSchema
} from "../middleware/validation.js";

const router = express.Router();

// ============ PUBLIC ROUTES (No Auth Required) ============
// Product browsing - public access
router.get("/productlist", productlist);
router.get("/productsbycategory", getAllProductsByCategory);

// Search with query validation (ReDoS protection in controller)
router.get("/search", validate(searchQuerySchema), getSearchProduct);

// ============ PROTECTED ROUTES (Auth Required) ============

/**
 * Get User's Orders
 * SECURITY:
 * - userAuth: Verifies JWT and sets req.userId
 * - Controller uses req.userId for IDOR protection
 */
router.get("/get-orders", userAuth, getUserOrders);

/**
 * Get Single Order by ID
 * SECURITY:
 * - userAuth: Verifies JWT and sets req.userId
 * - validateId: Validates ObjectId format (prevents injection)
 * - Controller verifies order belongs to authenticated user (IDOR protection)
 */
router.get(
  "/order/:id",
  userAuth,
  validateId('id'),
  getOrderById
);

/**
 * Validate Stock Availability
 * SECURITY:
 * - userAuth: Required for rate limiting abuse prevention
 * - validate: Validates items array structure
 */
router.post(
  "/validate-stock",
  userAuth,
  validate(validateStockSchema),
  validateStock
);

/**
 * Cancel Order
 * SECURITY:
 * - userAuth: Verifies JWT
 * - validateId: Validates ObjectId format
 */
router.post(
  "/order/:id/cancel",
  userAuth,
  validateId('id'),
  cancelOrder
);

/**
 * Request Return
 * SECURITY:
 * - userAuth: Verifies JWT
 * - validateId: Validates ObjectId format
 */
router.post(
  "/order/:id/return",
  userAuth,
  validateId('id'),
  requestReturn
);

export default router;
