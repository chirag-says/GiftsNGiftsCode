/**
 * Order Lifecycle Service — SINGLE OWNER of Order State Transitions
 * 
 * ARCHITECTURE RULE:
 * ALL order status changes MUST go through this service.
 * No controller, no webhook handler, no other service may directly mutate order.status.
 * 
 * This prevents:
 * - Seller controller and admin controller diverging on transition logic
 * - Illegal transitions (Delivered → Pending, Cancelled → Shipped)
 * - Race conditions via atomic MongoDB updates
 * - Silent state corruption from unvalidated changes
 * 
 * USAGE:
 *   import { transitionOrder, canTransition, getAllowedTransitions } from '../services/orderLifecycleService.js';
 *   
 *   // In any controller:
 *   const result = await transitionOrder(orderId, 'Shipped', 'seller', { actorId: req.sellerId });
 *   if (!result.success) return res.status(400).json({ success: false, message: result.error });
 *   res.json({ success: true, order: result.order });
 */
import orderModel from '../model/order.js';
import { lifecycle } from './logger.js';

// ─── STATES ────────────────────────────────────────────────────────────────────

export const ORDER_STATES = Object.freeze({
  CONFIRMED: 'Confirmed',
  PENDING: 'Pending',
  PROCESSING: 'Processing',
  SHIPPED: 'Shipped',
  OUT_FOR_DELIVERY: 'Out for Delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  RETURNED: 'Returned',
  REFUNDED: 'Refunded'
});

// ─── ALLOWED TRANSITIONS ───────────────────────────────────────────────────────

const TRANSITIONS = Object.freeze({
  [ORDER_STATES.CONFIRMED]:        [ORDER_STATES.PROCESSING, ORDER_STATES.CANCELLED],
  [ORDER_STATES.PENDING]:          [ORDER_STATES.PROCESSING, ORDER_STATES.CANCELLED],
  [ORDER_STATES.PROCESSING]:       [ORDER_STATES.SHIPPED, ORDER_STATES.CANCELLED],
  [ORDER_STATES.SHIPPED]:          [ORDER_STATES.OUT_FOR_DELIVERY, ORDER_STATES.DELIVERED, ORDER_STATES.CANCELLED],
  [ORDER_STATES.OUT_FOR_DELIVERY]: [ORDER_STATES.DELIVERED, ORDER_STATES.CANCELLED],
  [ORDER_STATES.DELIVERED]:        [ORDER_STATES.RETURNED, ORDER_STATES.REFUNDED],
  [ORDER_STATES.RETURNED]:         [ORDER_STATES.REFUNDED],
  [ORDER_STATES.CANCELLED]:        [],                         // Terminal
  [ORDER_STATES.REFUNDED]:         []                          // Terminal
});

// ─── ACTOR PERMISSIONS ─────────────────────────────────────────────────────────

const ACTOR_PERMISSIONS = Object.freeze({
  admin:   Object.values(ORDER_STATES),
  seller:  [ORDER_STATES.PROCESSING, ORDER_STATES.SHIPPED, ORDER_STATES.OUT_FOR_DELIVERY, ORDER_STATES.DELIVERED, ORDER_STATES.RETURNED],
  buyer:   [ORDER_STATES.CANCELLED],
  webhook: [ORDER_STATES.REFUNDED]
});

// ─── PURE VALIDATION (no DB, no side effects) ──────────────────────────────────

/**
 * Check if a transition is structurally valid.
 * Pure function — no database access.
 * 
 * @param {string} fromStatus - Current status
 * @param {string} toStatus - Desired status
 * @param {string} actor - 'admin', 'seller', or 'buyer'
 * @returns {{ allowed: boolean, reason?: string }}
 */
export const canTransition = (fromStatus, toStatus, actor = 'admin') => {
  const from = fromStatus?.trim();
  const to = toStatus?.trim();
  const role = actor?.toLowerCase();

  if (!TRANSITIONS[from]) {
    return { allowed: false, reason: `Unknown current status: "${from}"` };
  }

  if (!Object.values(ORDER_STATES).includes(to)) {
    return { allowed: false, reason: `Unknown target status: "${to}"` };
  }

  if (!TRANSITIONS[from].includes(to)) {
    const allowed = TRANSITIONS[from];
    return {
      allowed: false,
      reason: `Cannot move from "${from}" to "${to}". Allowed: ${allowed.length ? allowed.join(', ') : 'none (terminal state)'}`
    };
  }

  const actorPerms = ACTOR_PERMISSIONS[role];
  if (!actorPerms) {
    return { allowed: false, reason: `Unknown actor: "${role}"` };
  }

  if (!actorPerms.includes(to)) {
    return { allowed: false, reason: `Role "${role}" cannot set status to "${to}"` };
  }

  return { allowed: true };
};

/**
 * Get allowed next states for UI dropdowns.
 */
export const getAllowedTransitions = (currentStatus, actor = 'admin') => {
  const all = TRANSITIONS[currentStatus] || [];
  const perms = ACTOR_PERMISSIONS[actor?.toLowerCase()] || [];
  return all.filter(s => perms.includes(s));
};

// ─── SINGLE ENTRY POINT: TRANSITION ORDER ──────────────────────────────────────

/**
 * THE ONLY function that changes order status in the entire system.
 * 
 * Uses atomic findOneAndUpdate with status precondition to prevent:
 * - Race conditions (two concurrent status changes)
 * - Stale-state writes (optimistic concurrency)
 * 
 * @param {string} orderId - MongoDB ObjectId of the order
 * @param {string} newStatus - Desired new status
 * @param {string} actor - 'admin', 'seller', or 'buyer'
 * @param {Object} options
 * @param {string} options.actorId - ID of the person making the change
 * @param {string} options.reason - Reason (required for cancellation/refund)
 * @param {string} options.requestId - Request correlation ID for logging
 * @returns {Promise<{ success: boolean, order?: Object, error?: string, previousStatus?: string }>}
 */
export const transitionOrder = async (orderId, newStatus, actor, options = {}) => {
  try {
    // 1. Fetch current order to validate transition
    const order = await orderModel.findById(orderId);

    if (!order) {
      return { success: false, error: 'Order not found' };
    }

    // 2. Validate transition rules (pure, no side effects)
    const check = canTransition(order.status, newStatus, actor);

    if (!check.allowed) {
      lifecycle.order('transition_rejected', {
        orderId,
        from: order.status,
        to: newStatus,
        actor,
        actorId: options.actorId,
        reason: check.reason,
        requestId: options.requestId
      });
      return { success: false, error: check.reason };
    }

    // 3. Atomic update with status precondition (concurrency protection)
    //    The { status: order.status } condition ensures no other request
    //    changed the status between our read and write.
    const updateFields = {
      status: newStatus,
      'items.$[].status': newStatus
    };

    if (newStatus === ORDER_STATES.CANCELLED && options.reason) {
      updateFields.cancellationReason = options.reason;
    }

    const updatedOrder = await orderModel.findOneAndUpdate(
      { _id: orderId, status: order.status },  // Precondition: status hasn't changed
      { $set: updateFields },
      { new: true }
    );

    // 4. If null, another request changed the status first (race condition caught)
    if (!updatedOrder) {
      lifecycle.order('transition_conflict', {
        orderId,
        attemptedFrom: order.status,
        attemptedTo: newStatus,
        actor,
        requestId: options.requestId
      });
      return {
        success: false,
        error: 'Order status was modified by another request. Please refresh and try again.'
      };
    }

    // 5. Log successful transition
    lifecycle.order('state_transition', {
      orderId,
      from: order.status,
      to: newStatus,
      actor,
      actorId: options.actorId,
      reason: options.reason,
      requestId: options.requestId
    });

    return {
      success: true,
      order: updatedOrder,
      previousStatus: order.status
    };

  } catch (error) {
    lifecycle.error('transition_failed', error, {
      operation: 'order',
      orderId,
      to: newStatus,
      actor,
      requestId: options.requestId
    });
    return { success: false, error: 'Failed to update order status' };
  }
};

// ─── GLOBAL STATUS ROLLUP ──────────────────────────────────────────────────────

/**
 * Compute what the order-level status should be based on all item statuses.
 * Used by seller controller after per-item updates to derive the global status.
 *
 * This is the SINGLE source of truth for the rollup logic.
 *
 * @param {Array} items - Order items array (each with .status)
 * @returns {string|null} New global status, or null if no change needed
 */
export const computeGlobalStatus = (items) => {
  if (!items || items.length === 0) return null;

  const statuses = items.map(i => i.status || ORDER_STATES.PENDING);

  const allSame = statuses.every(s => s === statuses[0]);
  if (allSame) return statuses[0];

  const allTerminal = statuses.every(s =>
    s === ORDER_STATES.DELIVERED || s === ORDER_STATES.CANCELLED || s === ORDER_STATES.RETURNED || s === ORDER_STATES.REFUNDED
  );
  if (allTerminal) {
    // Mixed terminal — use the "worst" state
    if (statuses.includes(ORDER_STATES.CANCELLED) && statuses.includes(ORDER_STATES.DELIVERED)) return ORDER_STATES.DELIVERED;
    if (statuses.every(s => s === ORDER_STATES.CANCELLED)) return ORDER_STATES.CANCELLED;
    if (statuses.every(s => s === ORDER_STATES.RETURNED || s === ORDER_STATES.CANCELLED)) return ORDER_STATES.RETURNED;
    return statuses[0]; // Fallback for mixed terminal
  }

  // If any item is in-progress, order is Processing
  if (statuses.some(s => s === ORDER_STATES.PROCESSING || s === ORDER_STATES.SHIPPED || s === ORDER_STATES.OUT_FOR_DELIVERY)) {
    return ORDER_STATES.PROCESSING;
  }

  return null; // No change
};
