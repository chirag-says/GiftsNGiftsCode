import express from 'express';
import {
    // SECURITY: registerAdmin REMOVED - Admin accounts must be seeded manually
    loginAdmin,
    getAllOrders,
    adminUpdateOrderStatus,
    getAllSellers,
    toggleApprove,
    getAllProducts,
    approveProduct,
    getProductsBySeller,
    getDashboardStats,    // Name matched to controller
    getRecentActivities,
    userlist,              // Added this since it was in your controller
    getAdminProducts,
    toggleFeatured,
    toggleUserBlock,
    deleteReview,
    getAllReviews,
    updateReviewStatus,
    getReviewAnalytics,
    toggleSellerApproval,
    updateSellerCommission,
    getSellerProducts,
    getAllTransactions,
    getVendorPayouts,
    processPayout,
    getPendingSettlements,
    getCommissionReport,
    getRefunds,
    getFinancialStats,
    getAdvancedAnalytics,
    createCoupon,
    getMarketingData,
    updateStock,
    getInventoryData,
    exportSalesReport,
    createCampaign,
    createFlashSale,
    createBanner,
    deleteBanner,
    updateAffiliateSettings,

    checkInactiveVendors,
    getSellerInactivityReport,
    getAdminProfile,
    updateAdminProfile,
    logoutAdmin,
    adminDeleteProduct,

    // Homepage Collection Management
    getHomeCollections,
    toggleBestOfNorthEast,
    toggleUnder999,
    updateHomeCollections
} from '../controller/admincontroller.js';
import adminAuth from '../middleware/authAdmin.js';

const router = express.Router();

// ========================= AUTHENTICATION =========================
// SECURITY: Admin registration route REMOVED
// Admin accounts must be created manually via database seeding:
//   1. Use MongoDB Compass or CLI to insert admin document
//   2. Hash password with bcrypt before inserting
//   3. Example: db.admins.insertOne({ name: "Admin", email: "admin@example.com", password: "<bcrypt_hash>" })
// This prevents unauthorized privilege escalation via public API.

router.post('/login', loginAdmin);
router.post('/logout', logoutAdmin);
router.get('/account/profile', adminAuth, getAdminProfile);
router.put('/account/profile', adminAuth, updateAdminProfile);

// --- Dashboard Data ---
router.get("/stats", adminAuth, getDashboardStats);
router.get('/activity', adminAuth, getRecentActivities);

// --- Management Routes ---
router.get('/orders', adminAuth, getAllOrders);
router.put('/orders/:orderId/status', adminAuth, adminUpdateOrderStatus);
router.get('/users', adminAuth, userlist); // Added route for userlist
router.put('/toggle-user-block/:userId', adminAuth, toggleUserBlock);

// --- Product Routes ---
// router.get('/products', getAllProducts);
router.put('/toggle-product/:productId', adminAuth, approveProduct);
router.get("/seller-products/:sellerId", adminAuth, getProductsBySeller);
// Add these routes
router.get('/products', adminAuth, getAdminProducts); // Accepts ?type=pending, etc.
router.put('/toggle-featured/:id', adminAuth, toggleFeatured);
router.delete('/products/:id', adminAuth, adminDeleteProduct); // Admin delete product
router.get('/reviews/analytics', adminAuth, getReviewAnalytics);
router.get('/reviews', adminAuth, getAllReviews);
router.put('/review-status/:id', adminAuth, updateReviewStatus);
router.delete('/delete-review/:id', adminAuth, deleteReview);
router.get('/sellers', adminAuth, getAllSellers);
router.put('/toggle-approve/:id', adminAuth, toggleSellerApproval);
router.put('/update-commission/:id', adminAuth, updateSellerCommission); // NEW
router.get('/seller-products/:id', adminAuth, getSellerProducts);
router.get('/finance/transactions', adminAuth, getAllTransactions);
router.get('/finance/payouts', adminAuth, getVendorPayouts);
router.post('/finance/payout-action', adminAuth, processPayout);
router.get('/finance/settlements', adminAuth, getPendingSettlements);
router.get('/finance/commissions', adminAuth, getCommissionReport);
router.get('/finance/refunds', adminAuth, getRefunds);
router.get('/finance/stats', adminAuth, getFinancialStats);
router.get("/inventory", adminAuth, getInventoryData);
router.post("/inventory/update", adminAuth, updateStock);

// Marketing
router.get("/marketing", adminAuth, getMarketingData);
router.post("/marketing/coupon", adminAuth, createCoupon);
router.post("/marketing/campaign", adminAuth, createCampaign);
router.post("/marketing/flash-sale", adminAuth, createFlashSale);
router.post("/marketing/banner", adminAuth, createBanner);
router.delete("/marketing/banner/:id", adminAuth, deleteBanner);
router.post("/marketing/affiliate", adminAuth, updateAffiliateSettings);
router.get('/analytics/export', adminAuth, exportSalesReport);
// Analytics
router.get("/analytics/advanced", adminAuth, getAdvancedAnalytics);
router.get("/sellers/check-inactive", adminAuth, checkInactiveVendors);
router.get("/sellers/inactivity", adminAuth, getSellerInactivityReport);

// ========================= HOMEPAGE COLLECTION MANAGEMENT =========================
router.get('/home-collections', adminAuth, getHomeCollections);
router.put('/toggle-best-of-ne/:id', adminAuth, toggleBestOfNorthEast);
router.put('/toggle-under-999/:id', adminAuth, toggleUnder999);
router.put('/home-collections', adminAuth, updateHomeCollections);

export default router;