import mongoose from "mongoose";
import bcrypt from "bcryptjs";

/**
 * User Schema
 * 
 * PERFORMANCE FIX: activityLog is now capped to last 50 entries
 * to prevent unbounded document growth
 */
const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true
    },
    /**
     * PERFORMANCE FIX: Activity log is now managed with a middleware
     * that automatically caps it to the last 50 entries.
     * This prevents the document from growing indefinitely.
     * 
     * Alternative: Consider moving to a separate ActivityLog collection
     * if you need to store more than 50 actions per user.
     */
    activityLog: {
        type: [{
            action: { type: String }, // e.g., "Login", "Purchase"
            date: { type: Date, default: Date.now }
        }],
        default: []
    },
    verifyotp: {
        type: String,
        default: ''
    },
    verifyotpexpAt: {
        type: Number,
        default: 0
    },
    isAccountVerify: {
        type: Boolean,
        default: false
    },
    resetotp: {
        type: String,
        default: ''
    },
    resetotpexpireAt: {
        type: Number,
        default: 0
    },
    isBlocked: { type: Boolean, default: false },

    /**
     * Session Revocation: When set, all tokens issued before this timestamp
     * are automatically rejected by auth middleware.
     * 
     * Set on: password change, account compromise, admin force logout
     * Default null = no tokens invalidated (backward compatible)
     */
    tokenInvalidatedBefore: { type: Date, default: null },

});

// Maximum number of activity log entries to keep
const MAX_ACTIVITY_LOG_ENTRIES = 50;

/**
 * PERFORMANCE FIX: Pre-save middleware to cap activityLog
 * Keeps only the most recent 50 entries to prevent document bloat
 */
userSchema.pre('save', function (next) {
    if (this.activityLog && this.activityLog.length > MAX_ACTIVITY_LOG_ENTRIES) {
        // Keep only the last MAX_ACTIVITY_LOG_ENTRIES entries
        this.activityLog = this.activityLog.slice(-MAX_ACTIVITY_LOG_ENTRIES);
    }
    next();
});

/**
 * Method to add activity log entry (with automatic capping)
 * @param {string} action - The action to log
 */
userSchema.methods.logActivity = function (action) {
    this.activityLog.push({
        action,
        date: new Date()
    });

    // Cap the array immediately
    if (this.activityLog.length > MAX_ACTIVITY_LOG_ENTRIES) {
        this.activityLog = this.activityLog.slice(-MAX_ACTIVITY_LOG_ENTRIES);
    }
};

/**
 * Method to compare password for authentication
 * @param {string} candidatePassword - Password to compare
 * @returns {Promise<boolean>} - True if password matches
 */
userSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

// Corrected model creation logic
const usermodel = mongoose.models.user || mongoose.model('user', userSchema);

export default usermodel;
