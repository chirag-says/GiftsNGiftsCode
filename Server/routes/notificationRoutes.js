import express from 'express';
import {
    getAllNotificationsData,
    getNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAllNotifications,
    getOrderAlerts,
    createOrderAlert,
    markOrderAlertRead,
    deleteOrderAlert,
    getSystemUpdates,
    createSystemUpdate,
    updateSystemUpdate,
    deleteSystemUpdate,
    getVendorRequests,
    createVendorRequest,
    updateVendorRequest,
    deleteVendorRequest,
    getCustomerComplaints,
    createCustomerComplaint,
    updateCustomerComplaint,
    deleteCustomerComplaint,
    getNotificationSettings,
    updateNotificationSettings,
    getActivityLogs,
    createActivityLog,
    clearActivityLogs,
    getActivityStats
} from '../controller/notificationController.js';
import adminAuth from '../middleware/authAdmin.js';

const router = express.Router();

// Main data endpoint - gets all notifications data in one call
router.get('/', adminAuth, getAllNotificationsData);

// Notifications
router.get('/notifications', adminAuth, getNotifications);
router.put('/notification/:id/read', adminAuth, markAsRead);
router.post('/notifications/mark-all-read', adminAuth, markAllAsRead);
router.delete('/notification/:id', adminAuth, deleteNotification);
router.post('/notifications/clear', adminAuth, clearAllNotifications);

// Order Alerts
router.get('/order-alerts', adminAuth, getOrderAlerts);
router.post('/order-alert', adminAuth, createOrderAlert);
router.put('/order-alert/:id/read', adminAuth, markOrderAlertRead);
router.delete('/order-alert/:id', adminAuth, deleteOrderAlert);

// System Updates (Issue #51 fix — was missing adminAuth)
router.get('/system-updates', adminAuth, getSystemUpdates);
router.post('/system-update', adminAuth, createSystemUpdate);
router.put('/system-update/:id', adminAuth, updateSystemUpdate);
router.delete('/system-update/:id', adminAuth, deleteSystemUpdate);

// Vendor Requests (Issue #51 fix — was missing adminAuth)
router.get('/vendor-requests', adminAuth, getVendorRequests);
router.post('/vendor-request', adminAuth, createVendorRequest);
router.put('/vendor-request/:id', adminAuth, updateVendorRequest);
router.delete('/vendor-request/:id', adminAuth, deleteVendorRequest);

// Customer Complaints (Issue #51 fix — was missing adminAuth)
router.get('/complaints', adminAuth, getCustomerComplaints);
router.post('/complaint', adminAuth, createCustomerComplaint);
router.put('/complaint/:id', adminAuth, updateCustomerComplaint);
router.delete('/complaint/:id', adminAuth, deleteCustomerComplaint);

// Notification Settings (Issue #51 fix — was missing adminAuth)
router.get('/settings', adminAuth, getNotificationSettings);
router.put('/settings', adminAuth, updateNotificationSettings);

// Activity Logs (Issue #51 fix — was missing adminAuth)
router.get('/activity-logs', adminAuth, getActivityLogs);
router.post('/activity-log', adminAuth, createActivityLog);
router.post('/activity-logs/clear', adminAuth, clearActivityLogs);
router.get('/activity-stats', adminAuth, getActivityStats);

export default router;
