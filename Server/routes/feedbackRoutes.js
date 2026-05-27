import express from 'express';
import validator from 'validator';
import rateLimit from 'express-rate-limit';
const router = express.Router();
import Feedback from '../model/Feedback.js';

// Issue #18: IP-based rate limiting for anonymous feedback
// 10 submissions per hour per IP — prevents spam without requiring auth
const feedbackLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: { error: 'Too many feedback submissions. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

// POST /api/feedback
router.post('/', feedbackLimiter, async (req, res) => {
  try {
    const nameRaw = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const emailRaw = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const messageRaw = typeof req.body.message === 'string' ? req.body.message.trim() : '';

    if (!nameRaw || nameRaw.length > 120) {
      return res.status(400).json({ error: 'Provide a valid name under 120 characters.' });
    }

    if (!validator.isEmail(emailRaw)) {
      return res.status(400).json({ error: 'Provide a valid email address.' });
    }

    if (!messageRaw || messageRaw.length > 2000) {
      return res.status(400).json({ error: 'Message must be between 1 and 2000 characters.' });
    }

    // Sanitize to strip scripts while preserving readable text
    const sanitizedFeedback = {
      name: validator.escape(validator.stripLow(nameRaw, true)),
      email: emailRaw,
      message: validator.escape(validator.stripLow(messageRaw, true))
    };

    const newFeedback = new Feedback(sanitizedFeedback);
    await newFeedback.save();
    res.status(201).json({ message: 'Feedback submitted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Something went wrong' });
  }
});

export default router;
