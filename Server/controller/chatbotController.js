/**
 * Enhanced Chatbot Controller
 * Features:
 * - Fuzzy intent detection with typo tolerance
 * - Session context tracking (remembers orders, products)
 * - Pronoun resolution ("cancel it", "track that")
 * - Confirmation flows for destructive actions
 * - Response variations for natural conversation
 * - Analytics logging for improvement
 * - Time-aware greetings
 */

import crypto from 'crypto';
import mongoose from 'mongoose';
import orderModel from '../model/order.js';
import { ChatSession, SupportTicket } from '../model/supportModel.js';
import { searchProducts, getTrendingProducts, getProductsByCategory, simpleSearch } from '../services/productSearchService.js';
import { performOrderCancellation } from './clientcontroller.js';

// Import new enhanced services
import {
    detectIntent as enhancedDetectIntent,
    extractOrderId,
    extractColor,
    getSuggestionsForIntent
} from '../services/intentDetectionService.js';

import {
    getWelcomeMessage,
    getOrderStatusResponse,
    getOrderCancelResponse,
    getReturnResponse,
    getRefundResponse,
    getAddressResponse,
    getProductSearchResponse,
    getTrendingResponse,
    getGiftingResponse,
    getOffersResponse,
    getSupportEscalationResponse,
    getIssueLoggedResponse,
    getConfirmationPrompt,
    getGeneralResponse,
    getThanksResponse,
    getGoodbyeResponse,
    getLoginPrompt,
    getOrderIdPrompt
} from '../services/responseTemplates.js';

import {
    logUnknownQuery,
    logIntent,
    incrementMessageCount,
    trackSearchTerm,
    markResolved,
    addIntentToSession
} from '../model/chatAnalytics.js';

// ============================================
// CONSTANTS
// ============================================

const BASE_SUGGESTIONS = [
    'Track my order',
    'Cancel an order',
    'Return or replace',
    'Search products',
    'Talk to support'
];

const ORDER_STATUS_COPY = {
    Pending: 'waiting for confirmation',
    Processing: 'being prepared',
    Packed: 'packed and ready to ship',
    Shipped: 'on the way to you',
    Delivered: 'delivered successfully',
    'Out for Delivery': 'out with the courier',
    Cancelled: 'cancelled',
    Returned: 'returned',
    Refunded: 'refunded'
};

const formatCurrency = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
});

// ============================================
// UTILITY FUNCTIONS
// ============================================

const sanitizeMessage = (value = '') => value.replace(/\s+/g, ' ').trim();
const makeSessionId = () => `BOT-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
const isObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const buildDeviceMeta = (metadata = {}) => ({
    browser: metadata.browser || metadata.userAgent,
    platform: metadata.platform || metadata.device || 'web',
    locale: metadata.locale || metadata.language,
    timezone: metadata.timezone || 'Asia/Kolkata'
});

const statusRank = (status = 'Pending') => {
    const order = ['Pending', 'Processing', 'Packed', 'Shipped', 'Out for Delivery', 'Delivered'];
    const idx = order.findIndex((s) => s.toLowerCase() === status.toLowerCase());
    return idx === -1 ? 0 : idx;
};

const buildTimeline = (order) => {
    const rank = statusRank(order?.status);
    return [
        { key: 'placed', label: 'Order placed', done: true, date: order?.placedAt },
        { key: 'processing', label: 'Processing', done: rank >= 1 },
        { key: 'shipped', label: 'Shipped', done: rank >= 3 },
        { key: 'out', label: 'Out for delivery', done: rank >= 4 },
        { key: 'delivered', label: 'Delivered', done: rank >= 5 }
    ];
};

const buildOrderSnapshot = (order) => {
    if (!order) return null;
    const idString = String(order._id);
    return {
        orderId: idString,
        orderShort: idString.slice(-6).toUpperCase(),
        status: order.status,
        statusLabel: ORDER_STATUS_COPY[order.status] || order.status,
        totalAmount: formatCurrency.format(order.totalAmount || 0),
        placedAt: order.placedAt,
        shippingCity: order.shippingAddress?.city,
        itemCount: order.items?.length || 0,
        items: (order.items || []).map((item) => ({
            name: item.name,
            quantity: item.quantity
        }))
    };
};

const composeSuggestions = (contextSuggestions = [], intent = 'general') => {
    const intentSuggestions = getSuggestionsForIntent(intent);
    const merged = [...new Set([...contextSuggestions, ...intentSuggestions, ...BASE_SUGGESTIONS])];
    return merged.slice(0, 6);
};

const trimMessages = (messages = []) => messages.slice(-60);

// ============================================
// SESSION MANAGEMENT
// ============================================

const ensureSession = async (params = {}) => {
    const {
        sessionId,
        userId,
        userName,
        userEmail,
        userType = 'customer',
        metadata,
        source = 'web'
    } = params;

    let session = null;
    const timezone = metadata?.timezone || 'Asia/Kolkata';

    // Look up existing session
    if (sessionId) {
        session = await ChatSession.findOne({ sessionId });

        // Don't reuse if belongs to different user
        if (session && session.userId && userId && session.userId.toString() !== userId.toString()) {
            console.log('[Chatbot] Session belongs to different user, creating new session');
            session = null;
        }

        // Don't reuse logged-in session for anonymous user
        if (session && session.userId && !userId) {
            console.log('[Chatbot] Session has userId but request is anonymous, creating new session');
            session = null;
        }
    }

    // Find user's existing open session
    if (!session && userId) {
        session = await ChatSession.findOne({
            userId,
            status: { $ne: 'closed' },
            channel: 'chatbot'
        }).sort({ createdAt: -1 });
    }

    if (session) {
        session.status = 'active';
        if (userId && !session.userId) {
            session.userId = userId;
        }
        session.userName = session.userName || userName;
        session.userEmail = session.userEmail || userEmail;
        session.deviceMeta = { ...session.deviceMeta, ...buildDeviceMeta(metadata) };

        if (!session.context?.quickReplies?.length) {
            session.context = {
                ...(session.context || {}),
                quickReplies: BASE_SUGGESTIONS
            };
        }

        console.log('[Chatbot] Resuming session:', session.sessionId, 'UserId:', session.userId);
        return { session, isNew: false };
    }

    // Create new session with enhanced welcome message
    const welcomeMessage = getWelcomeMessage(userName, timezone);

    const newSession = new ChatSession({
        sessionId: makeSessionId(),
        userId,
        userName,
        userEmail,
        userType,
        status: 'active',
        channel: 'chatbot',
        source,
        deviceMeta: buildDeviceMeta(metadata),
        context: {
            lastIntent: 'welcome',
            quickReplies: BASE_SUGGESTIONS,
            // Enhanced context tracking
            lastOrderId: null,
            lastProductId: null,
            lastSearchQuery: null,
            awaitingConfirmation: null, // 'cancel' | 'return' | null
            pendingOrderId: null,
            recentOrders: [] // Cache user's recent orders
        },
        messages: [{
            sender: 'system',
            message: welcomeMessage,
            intent: 'welcome'
        }]
    });

    console.log('[Chatbot] Creating new session:', newSession.sessionId, 'UserId:', userId);
    return { session: newSession, isNew: true };
};

// ============================================
// ORDER RESOLUTION WITH CONTEXT
// ============================================

const resolveOrder = async ({ session, explicitOrderId, userId, pronounContext }) => {
    const userObjectId = userId && isObjectId(userId) ? new mongoose.Types.ObjectId(userId) : null;
    const sessionContext = session?.context || {};

    console.log('[Chatbot] resolveOrder called with:', {
        explicitOrderId,
        userId,
        pronounContext,
        lastOrderId: sessionContext.lastOrderId
    });

    // If explicit order ID provided
    if (explicitOrderId) {
        if (isObjectId(explicitOrderId)) {
            const query = { _id: new mongoose.Types.ObjectId(explicitOrderId) };
            if (userObjectId) query.user = userObjectId;
            const match = await orderModel.findOne(query);
            if (match) {
                console.log('[Chatbot] Found order by explicit ID:', match._id);
                return match;
            }
        }
    }

    // Handle pronouns: "it", "this", "that", "the order"
    if (pronounContext && sessionContext.lastOrderId) {
        console.log('[Chatbot] Using pronoun resolution, lastOrderId:', sessionContext.lastOrderId);
        const fromContext = await orderModel.findById(sessionContext.lastOrderId);
        if (fromContext && (!userObjectId || String(fromContext.user) === String(userObjectId))) {
            return fromContext;
        }
    }

    // Check order in current context
    if (sessionContext.orderInContext) {
        const fromContext = await orderModel.findById(sessionContext.orderInContext);
        if (fromContext && (!userObjectId || String(fromContext.user) === String(userObjectId))) {
            console.log('[Chatbot] Found order from context:', fromContext._id);
            return fromContext;
        }
    }

    // Use session.userId as fallback
    const effectiveUserId = userObjectId || (session?.userId && isObjectId(session.userId)
        ? new mongoose.Types.ObjectId(session.userId)
        : null);

    if (effectiveUserId) {
        console.log('[Chatbot] Searching latest order for user:', effectiveUserId.toString());
        const latestOrder = await orderModel.findOne({ user: effectiveUserId }).sort({ placedAt: -1 });
        if (latestOrder) {
            console.log('[Chatbot] Found latest order:', latestOrder._id, 'Status:', latestOrder.status);
        }
        return latestOrder;
    }

    console.log('[Chatbot] No userId available to search orders');
    return null;
};

// Load user's recent orders into context
const loadRecentOrders = async (userId) => {
    if (!userId || !isObjectId(userId)) return [];

    try {
        const orders = await orderModel
            .find({ user: new mongoose.Types.ObjectId(userId) })
            .sort({ placedAt: -1 })
            .limit(5)
            .lean();

        return orders.map(o => ({
            id: String(o._id),
            shortId: String(o._id).slice(-6).toUpperCase(),
            status: o.status,
            amount: o.totalAmount,
            items: o.items?.map(i => i.name) || []
        }));
    } catch (error) {
        console.error('[Chatbot] Error loading recent orders:', error.message);
        return [];
    }
};

// ============================================
// SUPPORT TICKET CREATION
// ============================================

const createSupportTicketFromChat = async ({ session, order, type, message }) => {
    const title = type === 'return' ? 'Return requested via chatbot' : 'Manual support request from chatbot';
    const summary = order ? `Order ${String(order._id)} | ${order.status}` : 'Order details unavailable';
    const customerName = session.userName || 'Guest user';
    const email = session.userEmail || 'guest@giftngifts.com';

    const ticket = new SupportTicket({
        customerId: session.userId,
        customerName,
        email,
        phone: '',
        subject: title,
        description: `${summary}\n${message || ''}`.trim(),
        priority: type === 'return' ? 'high' : 'medium',
        category: 'orders',
        messages: [{
            sender: 'customer',
            message: message || 'Assistance requested from chatbot'
        }]
    });

    await ticket.save();
    return ticket;
};

// ============================================
// PRONOUN DETECTION
// ============================================

const containsPronoun = (text) => {
    const normalized = text.toLowerCase();
    const pronounPatterns = [
        /\b(it|this|that)\b/,
        /\bthe order\b/,
        /\bthis one\b/,
        /\bthat one\b/,
        /\bsame order\b/,
        /\bmy order\b/,
        /\bthe same\b/,
        /\bprevious\b/
    ];

    return pronounPatterns.some(pattern => pattern.test(normalized));
};

// ============================================
// CONFIRMATION HANDLING
// ============================================

const isConfirmation = (text) => {
    const normalized = text.toLowerCase().trim();
    const yesPatterns = ['yes', 'yeah', 'yep', 'yup', 'sure', 'ok', 'okay', 'confirm', 'proceed', 'do it', 'go ahead', 'haan', 'ha', 'theek hai'];
    const noPatterns = ['no', 'nope', 'nah', 'cancel', 'stop', 'dont', "don't", 'nahi', 'mat karo', 'ruk'];

    if (yesPatterns.some(p => normalized.includes(p))) return 'yes';
    if (noPatterns.some(p => normalized.includes(p))) return 'no';
    return null;
};

// ============================================
// RESPONSE HANDLERS
// ============================================

const orderStatusResponse = async ({ session, userId, explicitOrderId }) => {
    const hasPronoun = containsPronoun(explicitOrderId || '');
    const order = await resolveOrder({ session, explicitOrderId, userId, pronounContext: hasPronoun });

    if (!order) {
        const isLoggedIn = !!userId || !!session?.userId;

        if (!isLoggedIn) {
            return {
                reply: getOrderStatusResponse('needLogin'),
                intent: 'order.status.need-login',
                payload: null,
                suggestions: ['Login to my account', 'I have an order ID', 'Browse products']
            };
        }

        if (explicitOrderId) {
            return {
                reply: getOrderStatusResponse('notFound'),
                intent: 'order.status.not-found',
                payload: null,
                suggestions: ['Show my orders', 'Talk to support', 'Browse products']
            };
        }

        return {
            reply: getOrderStatusResponse('noOrders'),
            intent: 'order.status.no-orders',
            payload: null,
            suggestions: ['Search products', 'Show trending items', 'Gift ideas']
        };
    }

    const snapshot = buildOrderSnapshot(order);
    const timeline = buildTimeline(order);

    // Determine response type based on status
    let responseType = 'found';
    let additionalInfo = '';

    if (order.status === 'Delivered') {
        responseType = 'delivered';
    } else if (order.status === 'Shipped' || order.status === 'Out for Delivery') {
        responseType = 'shipped';
        additionalInfo = timeline.find(s => s.label === 'Delivered' && s.done) ? '' : "I'll notify you as it moves.";
    }

    const reply = getOrderStatusResponse(responseType, {
        orderShort: snapshot.orderShort,
        statusLabel: snapshot.statusLabel,
        additionalInfo,
        eta: 'soon' // Could calculate from order data
    });

    return {
        reply,
        intent: 'order.status',
        payload: {
            type: 'order-status',
            order: snapshot,
            timeline
        },
        contextUpdates: {
            orderInContext: order._id,
            orderSnapshot: snapshot,
            lastOrderId: String(order._id)
        },
        suggestions: composeSuggestions(['Cancel this order', 'Change delivery address'], 'order.status')
    };
};

const orderCancelResponse = async ({ session, userId, explicitOrderId, skipConfirmation = false }) => {
    const hasPronoun = containsPronoun(explicitOrderId || '');
    const order = await resolveOrder({ session, explicitOrderId, userId, pronounContext: hasPronoun });

    if (!order) {
        const isLoggedIn = !!userId || !!session?.userId;

        if (!isLoggedIn) {
            return {
                reply: getOrderCancelResponse('needLogin'),
                intent: 'order.cancel.need-login',
                suggestions: ['Login to my account', 'I have an order ID', 'Talk to support']
            };
        }

        if (explicitOrderId) {
            return {
                reply: getOrderCancelResponse('needLogin').replace('log in', 'check the order ID'),
                intent: 'order.cancel.not-found',
                suggestions: ['Show my orders', 'Talk to support']
            };
        }

        return {
            reply: "You don't have any orders to cancel. Once you place an order, I can help you manage it!",
            intent: 'order.cancel.no-orders',
            suggestions: ['Search products', 'Show trending items', 'Browse gift ideas']
        };
    }

    const snapshot = buildOrderSnapshot(order);
    const cancellableStatuses = ['Confirmed', 'Pending', 'Processing'];

    // If not cancellable, escalate to support
    if (!cancellableStatuses.includes(order.status)) {
        const ticket = await createSupportTicketFromChat({
            session,
            order,
            type: 'manual',
            message: 'User attempted to cancel order but it is no longer cancellable.'
        });

        // Mark session as escalated
        await markResolved(session.sessionId, 'escalated', { ticketCreated: true });

        return {
            reply: getOrderCancelResponse('notCancellable', {
                status: order.status.toLowerCase(),
                ticketId: ticket.ticketId
            }),
            intent: 'order.cancel.escalated',
            payload: { type: 'ticket', ticketId: ticket.ticketId },
            suggestions: composeSuggestions(['Track my latest order'], 'order.cancel')
        };
    }

    // Request confirmation before cancellation (unless skipped)
    if (!skipConfirmation) {
        return {
            reply: getConfirmationPrompt('cancel', {
                orderShort: snapshot.orderShort,
                itemCount: snapshot.itemCount,
                totalAmount: snapshot.totalAmount
            }),
            intent: 'order.cancel.confirm',
            contextUpdates: {
                awaitingConfirmation: 'cancel',
                pendingOrderId: String(order._id),
                lastOrderId: String(order._id)
            },
            suggestions: ['Yes, cancel it', 'No, keep the order', 'Talk to support']
        };
    }

    // CRIT-2 FIX: Use shared cancellation flow (atomic, refund, stock restore, seller notify)
    const cancelResult = await performOrderCancellation(String(order._id), userId || session.userId, 'Cancelled via chatbot');

    if (!cancelResult.success) {
        // Concurrency conflict or state changed — tell user to retry
        return {
            reply: cancelResult.message || "Something changed with your order. Please try again.",
            intent: 'order.cancel.failed',
            suggestions: ['Track my order', 'Talk to support']
        };
    }

    // Track successful resolution
    await markResolved(session.sessionId, 'resolved', { orderCancelled: true });

    return {
        reply: getOrderCancelResponse('success', { orderShort: snapshot.orderShort }),
        intent: 'order.cancel',
        payload: { type: 'order-cancelled', order: buildOrderSnapshot(cancelResult.order) },
        contextUpdates: {
            orderInContext: order._id,
            orderSnapshot: buildOrderSnapshot(cancelResult.order),
            lastOrderId: String(order._id),
            awaitingConfirmation: null,
            pendingOrderId: null
        },
        suggestions: composeSuggestions(['Track another order', 'Browse new arrivals'], 'order.cancel')
    };
};

const orderReturnResponse = async ({ session, userId, explicitOrderId }) => {
    const hasPronoun = containsPronoun(explicitOrderId || '');
    const order = await resolveOrder({ session, explicitOrderId, userId, pronounContext: hasPronoun });

    if (!order) {
        const isLoggedIn = !!userId || !!session?.userId;

        if (!isLoggedIn) {
            return {
                reply: getReturnResponse('needLogin'),
                intent: 'order.return.need-login',
                suggestions: ['Login to my account', 'I have an order ID', 'Talk to support']
            };
        }

        return {
            reply: "You don't have any orders to return yet. Once you receive a delivery, I can help with returns!",
            intent: 'order.return.no-orders',
            suggestions: ['Search products', 'Show trending items', 'Browse gift ideas']
        };
    }

    if (order.status !== 'Delivered') {
        return {
            reply: getReturnResponse('notDelivered', { status: order.status.toLowerCase() }),
            intent: 'order.return.wait',
            suggestions: composeSuggestions(['Track delivery status'], 'order.return')
        };
    }

    const ticket = await createSupportTicketFromChat({
        session,
        order,
        type: 'return',
        message: 'Customer requested a return via chatbot.'
    });

    // Track resolution
    await markResolved(session.sessionId, 'resolved', { returnInitiated: true, ticketCreated: true });

    return {
        reply: getReturnResponse('initiated', {
            ticketId: ticket.ticketId,
            orderShort: String(order._id).slice(-6).toUpperCase()
        }),
        intent: 'order.return',
        payload: { type: 'ticket', ticketId: ticket.ticketId },
        contextUpdates: {
            lastOrderId: String(order._id)
        },
        suggestions: composeSuggestions(['Track pickup status', 'Talk to a human expert'], 'order.return')
    };
};

const addressResponse = () => ({
    reply: getAddressResponse(),
    intent: 'order.address',
    suggestions: composeSuggestions(['Track my latest order', 'Talk to support'], 'order.address')
});

const refundResponse = () => ({
    reply: getRefundResponse(),
    intent: 'order.refund',
    suggestions: composeSuggestions(['Track refund status', 'Talk to support'], 'order.refund')
});

const loginResponse = () => ({
    reply: getLoginPrompt(),
    intent: 'support.login',
    suggestions: composeSuggestions(['I have an order ID', 'Search products'], 'support.login')
});

const orderIdPromptResponse = () => ({
    reply: getOrderIdPrompt(),
    intent: 'order.status.awaiting-id',
    suggestions: composeSuggestions(['Track my order', 'Talk to support'], 'general')
});

const marketingResponse = () => ({
    reply: getOffersResponse(),
    intent: 'marketing.offer',
    suggestions: composeSuggestions(['Show gifting ideas', 'Track my order'], 'marketing.offer')
});

const giftingResponse = async ({ userMessage, session }) => {
    // Try to extract occasion from message
    const occasionKeywords = {
        birthday: 'birthday',
        anniversary: 'anniversary',
        wedding: 'wedding',
        rakhi: 'Rakhi',
        diwali: 'Diwali',
        christmas: 'Christmas',
        valentine: "Valentine's Day",
        'mothers day': "Mother's Day",
        'fathers day': "Father's Day"
    };

    let detectedOccasion = null;
    const lowerMessage = userMessage.toLowerCase();

    for (const [keyword, displayName] of Object.entries(occasionKeywords)) {
        if (lowerMessage.includes(keyword)) {
            detectedOccasion = displayName;
            break;
        }
    }

    // Search for gift-related products
    const searchResult = await searchProducts(userMessage + ' gift', { limit: 4 });

    if (searchResult.success && searchResult.products.length > 0) {
        // Track search
        await trackSearchTerm(userMessage, searchResult.products.length);

        return {
            reply: getGiftingResponse(detectedOccasion),
            intent: 'catalog.gifting',
            payload: {
                type: 'product-list',
                products: searchResult.products,
                searchInfo: searchResult.parsed
            },
            contextUpdates: {
                lastSearchQuery: userMessage
            },
            suggestions: composeSuggestions(['Gift ideas under ₹1000', 'Show more gifts'], 'catalog.gifting')
        };
    }

    return {
        reply: getGiftingResponse(),
        intent: 'catalog.gifting',
        suggestions: composeSuggestions(['Gift ideas under ₹1500', 'Birthday gifts'], 'catalog.gifting')
    };
};

// ============================================
// PRODUCT SEARCH RESPONSES
// ============================================

const productSearchResponse = async ({ userMessage, session }) => {
    let searchResult = await searchProducts(userMessage, { limit: 5 });

    // Fallback to simple search if no results
    if (searchResult.success && searchResult.products.length === 0) {
        const words = userMessage.toLowerCase().split(/\s+/);
        const productKeywords = ['cake', 'saree', 'gift', 'flower', 'chocolate', 'mug', 'watch',
            'bag', 'wallet', 'jewelry', 'hamper', 'box', 'frame', 'candle',
            'lamp', 'plant', 'dress', 'shirt', 'toy', 'perfume', 'decor'];

        const foundKeyword = words.find(word => productKeywords.includes(word));

        if (foundKeyword) {
            const simpleResults = await simpleSearch(foundKeyword, 5);
            if (simpleResults.length > 0) {
                searchResult = {
                    success: true,
                    products: simpleResults,
                    totalFound: simpleResults.length,
                    parsed: { searchTerms: [foundKeyword], priceFilter: null, colors: [] }
                };
            }
        }
    }

    if (!searchResult.success) {
        return {
            reply: getProductSearchResponse('error'),
            intent: 'product.search.error',
            suggestions: composeSuggestions(['Show trending items', 'Browse categories'], 'product.search')
        };
    }

    // Track search term
    await trackSearchTerm(userMessage, searchResult.products.length);

    if (searchResult.products.length === 0) {
        const trending = await getTrendingProducts(4);
        // Extract the main search term to show in the message
        const searchTerm = searchResult.parsed?.searchTerms?.[0] || userMessage.split(' ').slice(0, 2).join(' ');
        return {
            reply: getProductSearchResponse('noResults', { searchTerm }),
            intent: 'product.search.no-results',
            payload: trending.length > 0 ? { type: 'product-list', products: trending } : null,
            suggestions: composeSuggestions(['Show all products', 'Gift hampers', 'Try different search'], 'product.search')
        };
    }

    // Build response based on what was searched
    const { priceFilter, colors, searchTerms } = searchResult.parsed;
    let filters = '';

    if (colors?.length > 0) filters += ` in ${colors.join('/')}`;
    if (priceFilter) {
        if (priceFilter.max && !priceFilter.min) filters += ` under ₹${priceFilter.max}`;
        else if (priceFilter.min && !priceFilter.max) filters += ` above ₹${priceFilter.min}`;
        else if (priceFilter.min && priceFilter.max) filters += ` between ₹${priceFilter.min}-₹${priceFilter.max}`;
    }

    const reply = getProductSearchResponse(filters ? 'foundWithFilters' : 'found', {
        count: searchResult.products.length,
        searchTerm: searchTerms?.join(' ') || 'products',
        filters: filters.trim()
    });

    return {
        reply,
        intent: 'product.search',
        payload: {
            type: 'product-list',
            products: searchResult.products,
            searchInfo: searchResult.parsed
        },
        contextUpdates: {
            lastSearchQuery: userMessage,
            lastProductId: searchResult.products[0]?._id
        },
        suggestions: composeSuggestions(['Show more', 'Different category'], 'product.search')
    };
};

const trendingProductsResponse = async () => {
    const products = await getTrendingProducts(5);

    if (products.length === 0) {
        return {
            reply: "Our trending section is being updated. Try searching for something specific!",
            intent: 'product.trending',
            suggestions: composeSuggestions(['Gift ideas', 'Search products'], 'product.trending')
        };
    }

    return {
        reply: getTrendingResponse(),
        intent: 'product.trending',
        payload: { type: 'product-list', products },
        suggestions: composeSuggestions(['Show me gifts', 'Items under ₹500'], 'product.trending')
    };
};

const browseProductsResponse = async ({ userMessage }) => {
    const categoryMatch = userMessage.match(/(?:browse|category|shop)\s+(.+)/i);

    if (categoryMatch) {
        const result = await getProductsByCategory(categoryMatch[1].trim(), 5);
        if (result.success && result.products.length > 0) {
            return {
                reply: `Here are top items from ${result.category}:`,
                intent: 'product.browse',
                payload: {
                    type: 'product-list',
                    products: result.products,
                    category: result.category
                },
                suggestions: composeSuggestions(['Show more', 'Different category'], 'product.browse')
            };
        }
    }

    return {
        reply: "What would you like to explore? You can ask me things like:\n• \"Show me gift hampers\"\n• \"Red items under ₹1000\"\n• \"Trending products\"",
        intent: 'product.browse',
        suggestions: composeSuggestions(['Trending items', 'Gift hampers', 'Under ₹500'], 'product.browse')
    };
};

const supportEscalationResponse = async (session) => {
    session.context = {
        ...(session.context || {}),
        escalateToHuman: true
    };

    await markResolved(session.sessionId, 'escalated', { humanRequested: true });

    return {
        reply: getSupportEscalationResponse(),
        intent: 'support.agent',
        suggestions: composeSuggestions(['Track my order', 'Share more details'], 'support.agent')
    };
};

const issueResponse = async ({ session, rawMessage }) => {
    const ticket = await createSupportTicketFromChat({
        session,
        type: 'manual',
        message: rawMessage
    });

    await markResolved(session.sessionId, 'resolved', { ticketCreated: true });

    return {
        reply: getIssueLoggedResponse(ticket.ticketId),
        intent: 'support.issue',
        payload: { type: 'ticket', ticketId: ticket.ticketId },
        suggestions: composeSuggestions(['Track my order', 'Talk to a human'], 'support.issue')
    };
};

const generalResponse = () => ({
    reply: getGeneralResponse(),
    intent: 'general',
    suggestions: BASE_SUGGESTIONS
});

const thanksResponse = () => ({
    reply: getThanksResponse(),
    intent: 'thanks',
    suggestions: composeSuggestions(['Track my order', 'Browse products'], 'thanks')
});

const goodbyeResponse = () => ({
    reply: getGoodbyeResponse(),
    intent: 'goodbye',
    suggestions: composeSuggestions(['Track order', 'Browse products'], 'goodbye')
});

// ============================================
// API HANDLERS
// ============================================

export const createOrResumeSession = async (req, res) => {
    try {
        const { session, isNew } = await ensureSession(req.body || {});

        // Load recent orders into context for logged-in users
        if (session.userId && isNew) {
            const recentOrders = await loadRecentOrders(session.userId);
            session.context.recentOrders = recentOrders;
            if (recentOrders.length > 0) {
                session.context.lastOrderId = recentOrders[0].id;
            }
        }

        await session.save();
        res.status(200).json({ success: true, session });
    } catch (error) {
        console.error('Chatbot session error:', error);
        res.status(500).json({ success: false, message: 'Unable to start chat session.' });
    }
};

export const getChatSessionById = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const session = await ChatSession.findOne({ sessionId });
        if (!session) {
            return res.status(404).json({ success: false, message: 'Session not found.' });
        }
        res.status(200).json({ success: true, session });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Unable to fetch session.' });
    }
};

export const getChatSessionsForUser = async (req, res) => {
    try {
        const userId = req.userId;

        if (!userId || !isObjectId(userId)) {
            return res.status(400).json({ success: false, message: 'Valid userId is required.' });
        }

        const sessions = await ChatSession.find({ userId }).sort({ updatedAt: -1 }).limit(10);
        res.status(200).json({ success: true, sessions });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Unable to fetch sessions.' });
    }
};

export const handleChatMessage = async (req, res) => {
    try {
        const payload = req.body || {};
        const userMessage = sanitizeMessage(payload.message);

        if (!userMessage) {
            return res.status(400).json({ success: false, message: 'Message cannot be empty.' });
        }

        const { session } = await ensureSession(payload);
        const sessionContext = session.context && typeof session.context.toObject === 'function'
            ? session.context.toObject()
            : session.context || {};

        // Extract order ID from message
        const explicitOrderId = payload.orderId || extractOrderId(userMessage);

        // Check if user is responding to a confirmation prompt
        const confirmationResponse = isConfirmation(userMessage);

        // Track message count
        await incrementMessageCount(session.sessionId);

        let botResponse;

        // Handle pending confirmations
        if (sessionContext.awaitingConfirmation && confirmationResponse) {
            if (confirmationResponse === 'yes') {
                if (sessionContext.awaitingConfirmation === 'cancel') {
                    botResponse = await orderCancelResponse({
                        session,
                        userId: payload.userId,
                        explicitOrderId: sessionContext.pendingOrderId,
                        skipConfirmation: true
                    });
                } else if (sessionContext.awaitingConfirmation === 'return') {
                    botResponse = await orderReturnResponse({
                        session,
                        userId: payload.userId,
                        explicitOrderId: sessionContext.pendingOrderId
                    });
                }
            } else {
                // User said no to confirmation
                botResponse = {
                    reply: "No problem! I've kept your order as is. Anything else I can help with?",
                    intent: 'confirmation.cancelled',
                    contextUpdates: {
                        awaitingConfirmation: null,
                        pendingOrderId: null
                    },
                    suggestions: BASE_SUGGESTIONS
                };
            }
        } else {
            // Use enhanced intent detection
            const intentResult = enhancedDetectIntent(userMessage);
            const intent = intentResult.intent;
            const confidence = intentResult.confidence;

            console.log('[Chatbot] Detected intent:', intent, 'Confidence:', confidence.toFixed(2));

            // Log intent for analytics
            await logIntent({
                sessionId: session.sessionId,
                userId: payload.userId,
                userMessage,
                detectedIntent: intent,
                confidenceScore: confidence,
                matchedPhrase: intentResult.matchedPhrase,
                matchedKeywords: intentResult.matchedKeywords
            });

            // Track intent in session
            await addIntentToSession(session.sessionId, intent, payload.userId);

            // Log unknown/low confidence queries
            if (intent === 'general' || confidence < 0.3) {
                await logUnknownQuery({
                    sessionId: session.sessionId,
                    userId: payload.userId,
                    query: userMessage,
                    detectedIntent: intent,
                    confidenceScore: confidence,
                    metadata: payload.metadata
                });
            }

            // Route to appropriate handler
            switch (intent) {
                // Product intents
                case 'product.search':
                    botResponse = await productSearchResponse({ userMessage, session });
                    break;
                case 'product.trending':
                    botResponse = await trendingProductsResponse();
                    break;
                case 'product.browse':
                    botResponse = await browseProductsResponse({ userMessage });
                    break;

                // Order intents
                case 'order.status':
                    botResponse = await orderStatusResponse({ session, userId: payload.userId, explicitOrderId });
                    break;
                case 'order.cancel':
                    botResponse = await orderCancelResponse({ session, userId: payload.userId, explicitOrderId });
                    break;
                case 'order.return':
                    botResponse = await orderReturnResponse({ session, userId: payload.userId, explicitOrderId });
                    break;
                case 'order.address':
                    botResponse = addressResponse();
                    break;
                case 'order.refund':
                    botResponse = refundResponse();
                    break;
                case 'order.provide-id':
                    botResponse = orderIdPromptResponse();
                    break;

                // Marketing & catalog
                case 'marketing.offer':
                    botResponse = marketingResponse();
                    break;
                case 'catalog.gifting':
                    botResponse = await giftingResponse({ userMessage, session });
                    break;

                // Support
                case 'support.agent':
                    botResponse = await supportEscalationResponse(session);
                    break;
                case 'support.issue':
                    botResponse = await issueResponse({ session, rawMessage: userMessage });
                    break;
                case 'support.login':
                    botResponse = loginResponse();
                    break;

                // Conversational
                case 'greeting':
                    botResponse = {
                        reply: getWelcomeMessage(session.userName, sessionContext.deviceMeta?.timezone),
                        intent: 'greeting',
                        suggestions: BASE_SUGGESTIONS
                    };
                    break;
                case 'thanks':
                    botResponse = thanksResponse();
                    break;
                case 'goodbye':
                    botResponse = goodbyeResponse();
                    break;

                default:
                    // Try product search as fallback for unknown queries
                    if (confidence < 0.3) {
                        const searchAttempt = await productSearchResponse({ userMessage, session });
                        if (searchAttempt.payload?.products?.length > 0) {
                            botResponse = searchAttempt;
                        } else {
                            botResponse = generalResponse();
                        }
                    } else {
                        botResponse = generalResponse();
                    }
            }
        }

        // Add user message to session
        session.messages.push({
            sender: 'user',
            message: userMessage,
            intent: 'user.input'
        });

        // Update session context
        session.context = {
            ...sessionContext,
            lastIntent: botResponse.intent,
            ...(botResponse.contextUpdates || {}),
            quickReplies: botResponse.suggestions || BASE_SUGGESTIONS
        };

        // Add bot response to session
        session.messages.push({
            sender: 'agent',
            message: botResponse.reply,
            intent: botResponse.intent,
            payload: botResponse.payload
        });

        session.messages = trimMessages(session.messages);
        await session.save();

        res.status(200).json({
            success: true,
            session,
            reply: botResponse.reply,
            suggestions: session.context.quickReplies
        });
    } catch (error) {
        console.error('Chatbot message error:', error);
        res.status(500).json({ success: false, message: 'Unable to process that message right now.' });
    }
};

export const closeChatSession = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const session = await ChatSession.findOneAndUpdate(
            { sessionId },
            { status: 'closed' },
            { new: true }
        );

        if (!session) {
            return res.status(404).json({ success: false, message: 'Session not found.' });
        }

        // Mark conversation as abandoned if not resolved
        await markResolved(sessionId, 'abandoned');

        res.status(200).json({ success: true, session });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Unable to close session.' });
    }
};