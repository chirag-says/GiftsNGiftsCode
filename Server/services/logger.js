/**
 * Structured Logger — Critical Lifecycle Operations
 * 
 * PURPOSE:
 * Provides structured, JSON-formatted logging for critical business operations.
 * Replaces raw console.log in payment, order, webhook, and session flows.
 * 
 * NOT a global replacement. Only used for operations where:
 * - Debugging requires request correlation
 * - Audit trails matter (payments, refunds, state changes)
 * - Failure diagnosis needs structured context
 * 
 * USAGE:
 *   import { lifecycle } from '../services/logger.js';
 *   lifecycle.payment('verification_complete', { paymentId, orderId, amount });
 *   lifecycle.order('state_transition', { orderId, from: 'Pending', to: 'Shipped', actor: 'seller' });
 */
import winston from 'winston';

const { combine, timestamp, json, errors } = winston.format;

// Core logger instance — JSON format for structured parsing
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'ISO' }),
    json()
  ),
  defaultMeta: {
    service: 'giftsngifts-api',
    env: process.env.NODE_ENV || 'development'
  },
  transports: [
    new winston.transports.Console({
      // Human-readable in dev, JSON in production
      format: process.env.NODE_ENV === 'production'
        ? combine(timestamp(), json())
        : combine(
            timestamp({ format: 'HH:mm:ss' }),
            winston.format.printf(({ timestamp, level, message, operation, ...meta }) => {
              const metaStr = Object.keys(meta).length > 3
                ? ` ${JSON.stringify(meta, null, 0)}`
                : '';
              return `${timestamp} [${level.toUpperCase()}] ${operation || ''} ${message}${metaStr}`;
            })
          )
    })
  ]
});

/**
 * Lifecycle logger — domain-specific structured logging
 * 
 * Each method tags the log with an operation category,
 * making it filterable in production log aggregators.
 */
export const lifecycle = {
  /**
   * Payment lifecycle events
   * @param {string} event - e.g., 'checkout_initiated', 'verification_complete', 'webhook_received'
   * @param {Object} context - { paymentId, orderId, amount, userId, ... }
   */
  payment(event, context = {}) {
    logger.info(event, { operation: 'payment', ...context });
  },

  /**
   * Order lifecycle events
   * @param {string} event - e.g., 'created', 'state_transition', 'cancelled'
   * @param {Object} context - { orderId, from, to, actor, reason, ... }
   */
  order(event, context = {}) {
    logger.info(event, { operation: 'order', ...context });
  },

  /**
   * Webhook processing events
   * @param {string} event - e.g., 'received', 'verified', 'duplicate_ignored', 'processing_failed'
   * @param {Object} context - { webhookId, eventType, paymentId, ... }
   */
  webhook(event, context = {}) {
    logger.info(event, { operation: 'webhook', ...context });
  },

  /**
   * Session / auth lifecycle events
   * @param {string} event - e.g., 'login', 'logout', 'token_blacklisted', 'sessions_revoked'
   * @param {Object} context - { userId, sellerId, reason, ip, ... }
   */
  session(event, context = {}) {
    logger.info(event, { operation: 'session', ...context });
  },

  /**
   * Stock / inventory events
   * @param {string} event - e.g., 'reserved', 'confirmed', 'released', 'deducted'
   * @param {Object} context - { productId, quantity, orderId, ... }
   */
  stock(event, context = {}) {
    logger.info(event, { operation: 'stock', ...context });
  },

  /**
   * Idempotency events
   * @param {string} event - e.g., 'duplicate_detected', 'first_attempt', 'guard_passed'
   * @param {Object} context - { key, operation, ... }
   */
  idempotency(event, context = {}) {
    logger.info(event, { operation: 'idempotency', ...context });
  },

  /**
   * Error logging with full context
   * @param {string} event - What failed
   * @param {Error|Object} error - Error object or context
   * @param {Object} context - Additional context
   */
  error(event, error, context = {}) {
    logger.error(event, {
      operation: context.operation || 'unknown',
      errorMessage: error?.message || String(error),
      errorStack: error?.stack,
      ...context
    });
  }
};

export default logger;
