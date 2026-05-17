import express from 'express';
import {
    getRevenueAnalytics,
    getVendorPerformance,
    getSellerSalesReport,
    getProductAnalytics,
    getCustomerInsights,
    getTrafficReports,
    getCustomReports,
    createCustomReport,
    updateCustomReport,
    deleteCustomReport,
    runCustomReport,
    getExportLogs,
    createExport,
    deleteExportLog,
    getReportsSummary
} from '../controller/reportsController.js';
import adminAuth from '../middleware/authAdmin.js';

const router = express.Router();

// Summary
router.get('/summary', adminAuth, getReportsSummary);

// Revenue Analytics
router.get('/revenue', adminAuth, getRevenueAnalytics);

// Vendor Performance
router.get('/vendor-performance', adminAuth, getVendorPerformance);
router.get('/seller-sales', adminAuth, getSellerSalesReport);

// Product Analytics
router.get('/product-analytics', adminAuth, getProductAnalytics);

// Customer Insights
router.get('/customer-insights', adminAuth, getCustomerInsights);

// Traffic Reports
router.get('/traffic', adminAuth, getTrafficReports);

// Custom Reports
router.get('/custom', adminAuth, getCustomReports);
router.post('/custom', adminAuth, createCustomReport);
router.put('/custom/:id', adminAuth, updateCustomReport);
router.delete('/custom/:id', adminAuth, deleteCustomReport);
router.post('/custom/:id/run', adminAuth, runCustomReport);

// Export Data
router.get('/exports', adminAuth, getExportLogs);
router.post('/export', adminAuth, createExport);
router.delete('/export/:id', adminAuth, deleteExportLog);

export default router;
