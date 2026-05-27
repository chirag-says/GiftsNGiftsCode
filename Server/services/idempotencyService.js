/**
 * Idempotency Service — Prevents Duplicate Side Effects
 * 
 * PURPOSE:
 * Ensures that repeated requests (retries, double-clicks, webhook replays)
 * do not duplicate critical operations like:
 * - Payment verification
 * - Order creation
 * - Stock deduction
 * - Webhook processing
 * 
 * HOW IT WORKS:
 * 1. Before processing, check: isAlreadyProcessed(key)
 * 2. If yes → return cached result, skip processing
 * 3. If no → process normally, then markProcessed(key, result)
 * 
 * STORAGE:
 * MongoDB collection with TTL index for automatic cleanup.
 * Not in-memory — survives server restarts, works with multiple instances.
 * 
 * TTL:
 * - Payment/webhook records: 30 days (for dispute resolution)
 * - Temporary operations: 24 hours
 * - Expired records are automatically deleted by MongoDB
 * 
 * USAGE:
 *   import { isAlreadyProcessed, markProcessed } from '../services/idempotencyService.js';
 *   
 *   const key = `payment:${razorpay_payment_id}`;
 *   const existing = await isAlreadyProcessed(key);
 *   if (existing) return res.json(existing.result); // Return cached result
 *   
 *   // ... process payment ...
 *   
 *   await markProcessed(key, { orderId, status: 'captured' }, 'payment');
 */
import mongoose from 'mongoose';
import { lifecycle } from './logger.js';

// ─── SCHEMA ────────────────────────────────────────────────────────────────────

const idempotencySchema = new mongoose.Schema({
  // Unique key: "payment:{id}", "webhook:{event_id}", "order:{razorpay_order_id}"
  key: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  // Category for TTL differentiation
  category: {
    type: String,
    enum: ['payment', 'webhook', 'order', 'stock', 'temporary'],
    default: 'temporary'
  },
  // Processing status: 'processing' (lock held) or 'completed' (result available)
  status: {
    type: String,
    enum: ['processing', 'completed'],
    default: 'completed'
  },
  // Cached result to return on duplicate requests
  result: {
    type: mongoose.Schema.Types.Mixed
  },
  // When this record was created
  processedAt: {
    type: Date,
    default: Date.now
  },
  // TTL field — MongoDB automatically deletes documents after this date
  expiresAt: {
    type: Date,
    required: true,
    index: { expireAfterSeconds: 0 }  // MongoDB TTL index
  }
});

const IdempotencyRecord = mongoose.models.IdempotencyRecord ||
  mongoose.model('IdempotencyRecord', idempotencySchema);

// ─── TTL DURATIONS ─────────────────────────────────────────────────────────────

const TTL_DURATIONS = {
  payment:   30 * 24 * 60 * 60 * 1000, // 30 days
  webhook:   30 * 24 * 60 * 60 * 1000, // 30 days
  order:     30 * 24 * 60 * 60 * 1000, // 30 days
  stock:      7 * 24 * 60 * 60 * 1000, // 7 days
  temporary: 24 * 60 * 60 * 1000       // 24 hours
};

// ─── PUBLIC API ────────────────────────────────────────────────────────────────

/**
 * Check if an operation has already been processed.
 * 
 * @param {string} key - Unique idempotency key (e.g., "payment:pay_ABC123")
 * @returns {Promise<{ processed: boolean, result?: any }>}
 */
export const isAlreadyProcessed = async (key) => {
  try {
    const record = await IdempotencyRecord.findOne({ key }).lean();

    if (record) {
      lifecycle.idempotency('duplicate_detected', { key, originallyProcessedAt: record.processedAt });
      return { processed: true, result: record.result };
    }

    return { processed: false };
  } catch (error) {
    // On error, fail OPEN (allow processing) — better to risk a duplicate
    // than to block a legitimate payment
    lifecycle.error('idempotency_check_failed', error, { operation: 'idempotency', key });
    return { processed: false };
  }
};

/**
 * Mark an operation as processed.
 * Uses upsert to handle race conditions — if two requests check simultaneously
 * and both pass, the first one to upsert wins, the second gets a duplicate key error
 * which we catch and treat as "already processed".
 * 
 * @param {string} key - Unique idempotency key
 * @param {any} result - Result to cache for duplicate requests
 * @param {string} category - Category for TTL: 'payment', 'webhook', 'order', 'stock', 'temporary'
 * @returns {Promise<boolean>} true if successfully marked, false if already existed
 */
export const markProcessed = async (key, result = null, category = 'temporary') => {
  try {
    const ttl = TTL_DURATIONS[category] || TTL_DURATIONS.temporary;
    const expiresAt = new Date(Date.now() + ttl);

    await IdempotencyRecord.updateOne(
      { key },
      {
        $setOnInsert: {
          key,
          category,
          status: 'completed',
          result,
          processedAt: new Date(),
          expiresAt
        }
      },
      { upsert: true }
    );

    lifecycle.idempotency('marked_processed', { key, category, expiresAt });
    return true;
  } catch (error) {
    // Duplicate key error (11000) means another request already marked it
    if (error.code === 11000) {
      lifecycle.idempotency('concurrent_duplicate', { key });
      return false;
    }

    lifecycle.error('idempotency_mark_failed', error, { operation: 'idempotency', key });
    return false;
  }
};

// ─── LOCK-BASED IDEMPOTENCY (closes race window) ──────────────────────────

/**
 * Acquire a processing lock BEFORE doing work.
 * Atomically inserts a 'processing' record. If insert succeeds, caller has the lock.
 * If record already exists:
 *   - status='completed' → return the cached result (duplicate request)
 *   - status='processing' → another request is mid-flight (tell caller to retry)
 *
 * This closes the race window in the old check-then-process-then-mark pattern.
 *
 * @param {string} key - Unique idempotency key
 * @param {string} category - TTL category
 * @returns {Promise<{ acquired: boolean, existing?: { status: string, result: any } }>}
 */
export const acquireIdempotencyLock = async (key, category = 'temporary') => {
  try {
    const ttl = TTL_DURATIONS[category] || TTL_DURATIONS.temporary;
    const expiresAt = new Date(Date.now() + ttl);

    await IdempotencyRecord.create({
      key,
      category,
      status: 'processing',
      result: null,
      processedAt: new Date(),
      expiresAt
    });

    lifecycle.idempotency('lock_acquired', { key, category });
    return { acquired: true };
  } catch (error) {
    if (error.code === 11000) {
      // Record exists — check its status
      const existing = await IdempotencyRecord.findOne({ key }).lean();
      if (existing && existing.status === 'completed') {
        lifecycle.idempotency('duplicate_detected', { key });
        return { acquired: false, existing: { status: 'completed', result: existing.result } };
      }
      // Still processing — concurrent request in flight
      lifecycle.idempotency('concurrent_in_flight', { key });
      return { acquired: false, existing: { status: 'processing', result: null } };
    }

    // DB error — fail open (allow processing)
    lifecycle.error('lock_acquire_failed', error, { operation: 'idempotency', key });
    return { acquired: true }; // Fail open
  }
};

/**
 * Complete a processing lock with the final result.
 * Updates the record from 'processing' to 'completed' with the cached result.
 *
 * @param {string} key - Unique idempotency key
 * @param {any} result - Result to cache for future duplicate requests
 * @returns {Promise<boolean>}
 */
export const completeIdempotencyLock = async (key, result) => {
  try {
    await IdempotencyRecord.updateOne(
      { key },
      { $set: { status: 'completed', result } }
    );
    lifecycle.idempotency('lock_completed', { key });
    return true;
  } catch (error) {
    lifecycle.error('lock_complete_failed', error, { operation: 'idempotency', key });
    return false;
  }
};
