import jwt from "jsonwebtoken";
import "dotenv/config";
import sellermodel from "../model/sellermodel.js";
import { isTokenBlacklisted, getBlacklistReason } from "../utils/tokenBlacklist.js";

/**
 * Secure Cookie Configuration for Seller
 * OWASP Compliance: HttpOnly, Secure, SameSite
 */
export const SELLER_COOKIE_OPTIONS = {
  httpOnly: true,                                           // Prevents JavaScript access (XSS protection)
  secure: process.env.NODE_ENV === 'production',            // HTTPS only in production
  sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax', // CSRF protection
  maxAge: 7 * 24 * 60 * 60 * 1000,                         // 7 days
  path: '/'
};

/**
 * Seller Authentication Middleware
 * 
 * SECURITY FEATURES:
 * 1. ONLY reads JWT from HttpOnly cookie (no header/localStorage fallback)
 * 2. Explicit role verification from JWT payload
 * 3. Database validation of seller existence, status, and verification
 * 4. Blocks suspended/blocked accounts
 */
const authseller = async (req, res, next) => {
  try {
    // SECURITY: ONLY read from HttpOnly cookie - no other source
    const token = req.cookies?.stoken;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Login required. Please sign in."
      });
    }

    // SECURITY: Check if token is blacklisted (logged out) — Issue #7 fix
    if (isTokenBlacklisted(token)) {
      const reason = getBlacklistReason(token);
      console.warn(`Blocked blacklisted seller token. Reason: ${reason}, IP: ${req.ip}`);
      return res.status(401).json({
        success: false,
        message: "Session has been terminated. Please login again."
      });
    }

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: "Session expired. Please login again."
        });
      }
      if (jwtError.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          message: "Invalid session. Please login again."
        });
      }
      throw jwtError;
    }

    // SECURITY: Strict role verification from JWT
    if (!decoded.role || decoded.role !== 'seller') {
      console.warn(`🛡️ Seller auth failed: Invalid role. Token role: ${decoded.role}, IP: ${req.ip}`);
      return res.status(403).json({
        success: false,
        message: "Access denied. Seller privileges required."
      });
    }

    // CRITICAL: Fetch seller and check status
    const seller = await sellermodel.findById(decoded.id)
      .select('_id name email status verified approved isBlocked uniqueId region');

    if (!seller) {
      return res.status(401).json({
        success: false,
        message: "Seller not found. Please register."
      });
    }

    // Check if seller is blocked
    if (seller.isBlocked) {
      return res.status(403).json({
        success: false,
        message: "Your account has been blocked. Contact support for assistance."
      });
    }

    // Check if seller is suspended
    if (seller.status === 'Suspended') {
      return res.status(403).json({
        success: false,
        message: "Your account has been suspended. Contact support for assistance."
      });
    }

    // Check if seller email is verified
    if (!seller.verified) {
      return res.status(403).json({
        success: false,
        message: "Please verify your email first",
        requiresVerification: true
      });
    }

    // Attach seller info to request
    req.sellerId = decoded.id;
    req.seller = seller;
    req.sellerRole = decoded.role;

    next();
  } catch (error) {
    console.error("Seller Auth Middleware Error:", error);
    res.status(401).json({
      success: false,
      message: "Authentication failed."
    });
  }
};

export default authseller;
