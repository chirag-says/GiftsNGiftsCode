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
 * Process a full refund for an order via Razorpay
 * @param {string} paymentId - The Razorpay Payment ID
 * @returns {Promise<Object>} - The refund response from Razorpay
 */
export const processFullRefund = async (paymentId) => {
  if (!paymentId) {
    throw new Error('Payment ID is required for refund');
  }

  try {
    const refund = await instance.payments.refund(paymentId, {
      "speed": "optimum", // Processes in normal time, or instant if eligible
    });
    return { success: true, refundId: refund.id, data: refund };
  } catch (error) {
    console.error('Razorpay Refund Error:', error);
    // Standardize error message from razorpay
    const errorMsg = error.error?.description || error.message || 'Refund processing failed';
    return { success: false, error: errorMsg };
  }
};
