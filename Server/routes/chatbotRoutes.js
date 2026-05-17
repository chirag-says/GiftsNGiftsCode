import express from 'express';
import {
    createOrResumeSession,
    getChatSessionById,
    getChatSessionsForUser,
    handleChatMessage,
    closeChatSession
} from '../controller/chatbotController.js';
import userAuth from '../middleware/userAuth.js';

const router = express.Router();

/**
 * Chatbot Routes — Sprint 2/3 Audit Fix
 * 
 * DESIGN DECISION: The chatbot is designed to work for both logged-in and guest users.
 * Lines 159-180 of useChatbot.js explicitly handle login/logout state transitions.
 * The session creation endpoint sends userId when available but works without it.
 * 
 * Therefore:
 * - /sessions (list user's history) → requires userAuth (private data)
 * - /session, /message, /session/:id, /close → public (chatbot must work for guests)
 */
router.post('/session', createOrResumeSession);
router.get('/session/:sessionId', getChatSessionById);
router.get('/sessions', userAuth, getChatSessionsForUser);  // Only this needs auth — lists user's sessions
router.post('/message', handleChatMessage);
router.post('/session/:sessionId/close', closeChatSession);

export default router;
