/**
 * Stock Reservation Service
 * 
 * SECURITY PURPOSE:
 * Prevents overselling by reserving stock when payment is initiated,
 * not just when payment succeeds. Implements timeout logic to release
 * reservations for failed/abandoned payments.
 * 
 * ARCHITECTURE:
 * - Reserve stock when Razorpay order is created
 * - Release reservation on payment failure/timeout
 * - Confirm (deduct from actual stock) on payment success
 */

import mongoose from 'mongoose';
import Product from '../model/addproduct.js';

// Reservation timeout in milliseconds (10 minutes)
const RESERVATION_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Reserve stock for items during checkout
 * Uses MongoDB transactions when available
 * 
 * @param {Array} items - Array of { productId, quantity }
 * @param {string} razorpayOrderId - Razorpay order ID for tracking
 * @param {string} userId - User ID making the purchase
 * @returns {Object} - { success, reservedItems, errors }
 */
export const reserveStock = async (items, razorpayOrderId, userId) => {
    const session = await mongoose.startSession();
    const reservedItems = [];
    const errors = [];

    try {
        session.startTransaction();

        for (const item of items) {
            const product = await Product.findById(item.productId).session(session);

            if (!product) {
                errors.push({ productId: item.productId, error: 'Product not found' });
                continue;
            }

            // Calculate available stock (total - already reserved)
            const availableStock = product.stock - (product.reservedStock || 0);

            if (availableStock < item.quantity) {
                errors.push({
                    productId: item.productId,
                    title: product.title,
                    error: `Insufficient stock. Available: ${availableStock}, Requested: ${item.quantity}`
                });
                continue;
            }

            // Reserve the stock
            const expiresAt = new Date(Date.now() + RESERVATION_TIMEOUT_MS);

            product.reservedStock = (product.reservedStock || 0) + item.quantity;
            product.reservations = product.reservations || [];
            product.reservations.push({
                razorpayOrderId,
                userId,
                quantity: item.quantity,
                createdAt: new Date(),
                expiresAt
            });

            await product.save({ session });

            reservedItems.push({
                productId: item.productId,
                title: product.title,
                quantity: item.quantity,
                expiresAt
            });
        }

        // If any errors occurred, abort transaction
        if (errors.length > 0) {
            await session.abortTransaction();
            return { success: false, reservedItems: [], errors };
        }

        await session.commitTransaction();

        console.log(`🔒 Stock reserved for order ${razorpayOrderId}: ${reservedItems.length} items`);

        return { success: true, reservedItems, errors: [] };

    } catch (error) {
        await session.abortTransaction();
        console.error('Stock reservation error:', error);
        return { success: false, reservedItems: [], errors: [{ error: error.message }] };
    } finally {
        session.endSession();
    }
};

/**
 * Release reserved stock (for failed/cancelled payments)
 * 
 * @param {string} razorpayOrderId - Razorpay order ID
 * @returns {Object} - { success, releasedCount }
 */
export const releaseReservation = async (razorpayOrderId) => {
    try {
        // Find all products with this reservation
        const products = await Product.find({
            'reservations.razorpayOrderId': razorpayOrderId
        });

        let releasedCount = 0;

        for (const product of products) {
            const reservation = product.reservations.find(
                r => r.razorpayOrderId === razorpayOrderId
            );

            if (reservation) {
                // Release the reserved stock
                product.reservedStock = Math.max(0, (product.reservedStock || 0) - reservation.quantity);

                // Remove the reservation entry
                product.reservations = product.reservations.filter(
                    r => r.razorpayOrderId !== razorpayOrderId
                );

                await product.save();
                releasedCount++;
            }
        }

        console.log(`🔓 Released reservation for order ${razorpayOrderId}: ${releasedCount} products`);

        return { success: true, releasedCount };

    } catch (error) {
        console.error('Release reservation error:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Confirm stock purchase (deduct from actual stock)
 * Called when payment is successfully verified
 * 
 * @param {string} razorpayOrderId - Razorpay order ID
 * @returns {Object} - { success, confirmedItems }
 */
export const confirmStockPurchase = async (razorpayOrderId) => {
    const session = await mongoose.startSession();
    const confirmedItems = [];

    try {
        session.startTransaction();

        const products = await Product.find({
            'reservations.razorpayOrderId': razorpayOrderId
        }).session(session);

        for (const product of products) {
            const reservation = product.reservations.find(
                r => r.razorpayOrderId === razorpayOrderId
            );

            if (reservation) {
                // Deduct from actual stock
                product.stock = Math.max(0, product.stock - reservation.quantity);

                // Release the reservation
                product.reservedStock = Math.max(0, (product.reservedStock || 0) - reservation.quantity);

                // Remove the reservation entry
                product.reservations = product.reservations.filter(
                    r => r.razorpayOrderId !== razorpayOrderId
                );

                await product.save({ session });

                confirmedItems.push({
                    productId: product._id,
                    title: product.title,
                    quantityPurchased: reservation.quantity,
                    remainingStock: product.stock
                });
            }
        }

        await session.commitTransaction();

        console.log(`✅ Stock purchase confirmed for order ${razorpayOrderId}: ${confirmedItems.length} items`);

        return { success: true, confirmedItems };

    } catch (error) {
        await session.abortTransaction();
        console.error('Confirm stock purchase error:', error);
        return { success: false, error: error.message };
    } finally {
        session.endSession();
    }
};

/**
 * Clean up expired reservations
 * Should be run periodically (e.g., every minute via cron)
 * 
 * @returns {Object} - { success, cleanedCount }
 */
export const cleanupExpiredReservations = async () => {
    try {
        const now = new Date();

        // Find products with expired reservations
        const products = await Product.find({
            'reservations.expiresAt': { $lt: now }
        });

        let cleanedCount = 0;

        for (const product of products) {
            const expiredReservations = product.reservations.filter(
                r => r.expiresAt && r.expiresAt < now
            );

            if (expiredReservations.length > 0) {
                // Calculate total quantity to release
                const releaseQuantity = expiredReservations.reduce(
                    (sum, r) => sum + r.quantity, 0
                );

                // Release reserved stock
                product.reservedStock = Math.max(0, (product.reservedStock || 0) - releaseQuantity);

                // Remove expired reservations
                product.reservations = product.reservations.filter(
                    r => !r.expiresAt || r.expiresAt >= now
                );

                await product.save();
                cleanedCount += expiredReservations.length;

                console.log(`⏰ Released ${releaseQuantity} expired reserved stock for ${product.title}`);
            }
        }

        if (cleanedCount > 0) {
            console.log(`🧹 Cleaned up ${cleanedCount} expired reservations`);
        }

        return { success: true, cleanedCount };

    } catch (error) {
        console.error('Cleanup expired reservations error:', error);
        return { success: false, error: error.message };
    }
};

// Start periodic cleanup (every minute)
const cleanupInterval = setInterval(cleanupExpiredReservations, 60 * 1000);

// Ensure cleanup timer doesn't prevent process exit
if (cleanupInterval.unref) {
    cleanupInterval.unref();
}

/**
 * Restore actual stock after an order cancellation or return.
 * 
 * @param {Array} items - Array of { productId, quantity }
 * @returns {Promise<Object>} - { success, restoredCount, error }
 */
export const restoreCancelledStock = async (items) => {
    if (!items || !items.length) return { success: true, restoredCount: 0 };

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        let restoredCount = 0;

        for (const item of items) {
            const product = await Product.findById(item.productId).session(session);
            
            if (product) {
                // Restore actual stock
                product.stock += item.quantity;
                await product.save({ session });
                restoredCount++;
            }
        }

        await session.commitTransaction();
        console.log(`✅ Restored stock for ${restoredCount} cancelled/returned items`);
        
        return { success: true, restoredCount };
    } catch (error) {
        await session.abortTransaction();
        console.error('Restore cancelled stock error:', error);
        return { success: false, error: error.message };
    } finally {
        session.endSession();
    }
};

export default {
    reserveStock,
    releaseReservation,
    confirmStockPurchase,
    cleanupExpiredReservations,
    restoreCancelledStock,
    RESERVATION_TIMEOUT_MS
};
