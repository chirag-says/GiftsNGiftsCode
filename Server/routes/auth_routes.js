/**
 * Authentication Routes
 * REFACTORED: Imports from separated controllers for Single Responsibility
 */
import express from "express";

// Auth-only controller
import {
    register,
    login,
    logout,
    sendverifyotp,
    verifyingEmail,
    isAuthenticated,
    sendResetpassword,
    resetpassword,
    verifyRegistrationOtp,
    resendRegistrationOtp,
    logoutUser,
    getMe
} from "../controller/auth_controller.js";

// REFACTORED: Cart functions from separate controller
import {
    Addtocart,
    GetCart,
    DeleteFromCart,
    ToggleCartQuantity,
    clearUserCart
} from "../controller/cartController.js";

// REFACTORED: Wishlist functions from separate controller
import {
    AddToWishlist,
    GetWishlist,
    RemoveFromWishlist
} from "../controller/wishlistController.js";

import userAuth from "../middleware/userAuth.js";

const router = express.Router();

// ============ AUTH ROUTES ============
router.post('/register', register);
router.post('/verify-registration-otp', verifyRegistrationOtp);
router.post('/resend-registration-otp', resendRegistrationOtp);
router.post('/login', login);
router.post('/logout', logout);
router.post('/send-verify-otp', userAuth, sendverifyotp);
router.post('/verify-Account', userAuth, verifyingEmail);
router.get('/is-auth', userAuth, isAuthenticated);
router.post('/send-reset-otp', sendResetpassword);
router.post('/reset-password', resetpassword);
// ============ SESSION MANAGEMENT ============
router.get('/me', userAuth, getMe);
router.post('/logout-session', userAuth, logoutUser);

// ============ CART ROUTES ============
router.post('/Cart', userAuth, Addtocart)
router.get('/Cart', userAuth, GetCart)
router.delete('/delete/:productId', userAuth, DeleteFromCart)
router.put('/update-quantity', userAuth, ToggleCartQuantity);
router.delete("/clear-cart", userAuth, clearUserCart);

// ============ WISHLIST ROUTES ============
router.post('/wishlist', userAuth, AddToWishlist)
router.get('/wishlist', userAuth, GetWishlist)
router.delete('/delete-wishlist/:productId', userAuth, RemoveFromWishlist)

export default router