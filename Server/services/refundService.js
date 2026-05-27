/**
 * Refund Service
 * Handles Razorpay refund API interactions
 */
import Razorpay from 'razorpay';
import dotenv from 'dotenv';
dotenv.config();

const instance = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/**
 * Process a refund for an order via Razorpay.
 * 
 * If amountInPaise is provided, issues a PARTIAL refund for that amount.
 * If omitted, issues a FULL refund of the entire payment.
 * 
 * @param {string} paymentId - The Razorpay Payment ID
 * @param {number} [amountInPaise] - Optional. Amount to refund in paise (e.g., ₹100 = 10000).
 *                                   If omitted, Razorpay refunds the full captured amount.
 * @returns {Promise<Object>} - { success, refundId, data } or { success: false, error }
 */
export const processFullRefund = async (paymentId, amountInPaise) => {
  if (!paymentId) {
    throw new Error('Payment ID is required for refund');
  }

  try {
    const refundOptions = {
      "speed": "optimum", // Processes in normal time, or instant if eligible
    };

    // If amount is provided, issue a partial refund
    if (amountInPaise && amountInPaise > 0) {
      refundOptions.amount = Math.round(amountInPaise);
    }

    const refund = await instance.payments.refund(paymentId, refundOptions);
    return { success: true, refundId: refund.id, data: refund };
  } catch (error) {
    console.error('Razorpay Refund Error:', error);
    // Standardize error message from razorpay
    const errorMsg = error.error?.description || error.message || 'Refund processing failed';
    return { success: false, error: errorMsg };
  }
};
