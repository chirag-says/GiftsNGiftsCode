/**
 * Request Correlation Middleware
 * 
 * PURPOSE:
 * Generates a unique requestId for every incoming request.
 * This ID flows through the entire request lifecycle:
 *   Request → Controller → Service → Logger
 * 
 * Makes it possible to trace a single user action across all log entries.
 * 
 * USAGE:
 * In server.js:
 *   import { requestCorrelation } from './middleware/requestCorrelation.js';
 *   app.use(requestCorrelation);
 * 
 * In controllers/services:
 *   req.requestId  // Available on every request
 */
import crypto from 'crypto';

/**
 * Middleware that attaches a unique requestId to every request.
 * 
 * Uses the client-provided X-Request-ID header if present (for distributed tracing),
 * otherwise generates a short unique ID.
 * 
 * Format: 8-character hex string (e.g., "a1b2c3d4")
 * Short enough to include in every log line without noise.
 */
export const requestCorrelation = (req, res, next) => {
  // Respect client-provided request ID (for distributed tracing)
  // but validate it — max 64 chars, alphanumeric + dashes only
  const clientId = req.headers['x-request-id'];
  
  if (clientId && /^[a-zA-Z0-9-]{1,64}$/.test(clientId)) {
    req.requestId = clientId;
  } else {
    req.requestId = crypto.randomBytes(4).toString('hex'); // 8 hex chars
  }

  // Echo back in response header for client-side correlation
  res.setHeader('X-Request-ID', req.requestId);

  next();
};
