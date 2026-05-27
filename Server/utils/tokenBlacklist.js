/**
 * Token Blacklist - Session Revocation System
 * 
 * SECURITY PURPOSE:
 * Implements server-side token invalidation to properly revoke sessions.
 * This solves the stateless JWT problem where logout only clears cookies
 * but leaves the JWT valid until expiry.
 * 
 * ARCHITECTURE:
 * - Uses in-memory Map with TTL (Time-To-Live) for token storage
 * - Tokens are stored until their natural expiry time
 * - Automatic cleanup of expired entries to prevent memory leaks
 * 
 * PRODUCTION NOTE:
 * For horizontal scaling (multiple server instances), replace this with Redis.
 */

import jwt from 'jsonwebtoken';

// In-memory blacklist storage
// Key: JWT token (or JTI if available)
// Value: { expiresAt: timestamp, reason: string }
const tokenBlacklist = new Map();

// Cleanup interval (runs every 5 minutes)
const CLEANUP_INTERVAL = 5 * 60 * 1000;

/**
 * Add a token to the blacklist
 * 
 * @param {string} token - JWT token to blacklist
 * @param {string} reason - Reason for blacklisting (e.g., 'logout', 'password_change')
 * @returns {boolean} - True if successfully added
 */
export const blacklistToken = (token, reason = 'logout') => {
    try {
        if (!token || typeof token !== 'string') {
            return false;
        }

        // Decode token to get expiry time (no verification needed here)
        const decoded = jwt.decode(token);

        if (!decoded || !decoded.exp) {
            // If no expiry, set a default of 24 hours
            const expiresAt = Date.now() + (24 * 60 * 60 * 1000);
            tokenBlacklist.set(token, { expiresAt, reason });
            return true;
        }

        // Store until token naturally expires
        const expiresAt = decoded.exp * 1000; // Convert to milliseconds

        // Don't store already expired tokens
        if (expiresAt <= Date.now()) {
            return false;
        }

        tokenBlacklist.set(token, { expiresAt, reason });

        console.log(`🔒 Token blacklisted. Reason: ${reason}. Expires at: ${new Date(expiresAt).toISOString()}`);

        return true;
    } catch (error) {
        console.error('Failed to blacklist token:', error);
        return false;
    }
};

/**
 * Check if a token is blacklisted
 * 
 * @param {string} token - JWT token to check
 * @returns {boolean} - True if token is blacklisted
 */
export const isTokenBlacklisted = (token) => {
    if (!token || typeof token !== 'string') {
        return false;
    }

    const entry = tokenBlacklist.get(token);

    if (!entry) {
        return false;
    }

    // Check if the blacklist entry has expired
    if (entry.expiresAt <= Date.now()) {
        // Clean up expired entry
        tokenBlacklist.delete(token);
        return false;
    }

    return true;
};

/**
 * Get blacklist reason (for logging/debugging)
 * 
 * @param {string} token - JWT token
 * @returns {string|null} - Reason or null if not blacklisted
 */
export const getBlacklistReason = (token) => {
    const entry = tokenBlacklist.get(token);
    return entry ? entry.reason : null;
};

/**
 * Clean up expired entries from the blacklist
 * Called automatically at regular intervals
 */
export const cleanupExpiredTokens = () => {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [token, entry] of tokenBlacklist.entries()) {
        if (entry.expiresAt <= now) {
            tokenBlacklist.delete(token);
            cleanedCount++;
        }
    }

    if (cleanedCount > 0) {
        console.log(`🧹 Token blacklist cleanup: Removed ${cleanedCount} expired entries. Current size: ${tokenBlacklist.size}`);
    }
};

/**
 * Get current blacklist size (for monitoring)
 * 
 * @returns {number} - Number of blacklisted tokens
 */
export const getBlacklistSize = () => tokenBlacklist.size;

/**
 * Blacklist all tokens for a specific user
 * Used for: password change, account compromise, admin force logout
 * 
 * NOTE: This requires storing user ID with tokens. For now, tracks by token value.
 * For user-based revocation, consider using a separate userRevocationTimestamp system.
 * 
 * @param {string} userId - User ID to revoke all sessions for
 * @param {string} reason - Reason for mass revocation
 */
export const revokeAllUserSessions = async (userId, role = 'user', reason = 'all_sessions_revoked') => {
    try {
        // Dynamically import the correct model based on role
        // This avoids circular dependency issues
        const timestamp = new Date();

        if (role === 'seller') {
            const { default: sellermodel } = await import('../model/sellermodel.js');
            await sellermodel.findByIdAndUpdate(userId, {
                $set: { tokenInvalidatedBefore: timestamp }
            });
        } else {
            const { default: usermodel } = await import('../model/mongobd_usermodel.js');
            await usermodel.findByIdAndUpdate(userId, {
                $set: { tokenInvalidatedBefore: timestamp }
            });
        }

        console.log(`🔒 All sessions revoked for ${role} ${userId}. Reason: ${reason}. Tokens before ${timestamp.toISOString()} will be rejected.`);
        return true;
    } catch (error) {
        console.error(`Failed to revoke sessions for ${userId}:`, error.message);
        return false;
    }
};

// Start automatic cleanup
const cleanupTimer = setInterval(cleanupExpiredTokens, CLEANUP_INTERVAL);

// Ensure cleanup timer doesn't prevent process exit
if (cleanupTimer.unref) {
    cleanupTimer.unref();
}

// Initial cleanup on module load
cleanupExpiredTokens();

export default {
    blacklistToken,
    isTokenBlacklisted,
    getBlacklistReason,
    cleanupExpiredTokens,
    getBlacklistSize,
    revokeAllUserSessions
};
