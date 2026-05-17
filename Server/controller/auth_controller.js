/**
 * Authentication Controller
 * REFACTORED: Contains only authentication-related logic
 * SECURITY FIX: Using crypto.randomInt() for secure OTP generation
 * 
 * Cart logic moved to: cartController.js
 * Wishlist logic moved to: wishlistController.js
 */
import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import usermodel from "../model/mongobd_usermodel.js";
import { sendEmail } from "../config/mail.js";
import Profile from "../model/userprofile.js";
import { blacklistToken } from "../utils/tokenBlacklist.js";

/**
 * SECURITY: Generate cryptographically secure 6-digit OTP
 * Uses crypto.randomInt() instead of Math.random()
 */
const generateSecureOTP = () => {
  return String(crypto.randomInt(100000, 999999));
};

 
export const register = async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ success: false, message: "Missing details" });
  }

  const existingUser = await usermodel.findOne({ email });

  if (existingUser && existingUser.isAccountVerify) {
    return res.status(400).json({ success: false, message: "User already exists" });
  }

  // 🔥 FIX: remove unverified user
  if (existingUser && !existingUser.isAccountVerify) {
    await usermodel.deleteOne({ email });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const otp = generateSecureOTP();

  const user = new usermodel({
    name,
    email,
    password: hashedPassword,
    verifyotp: otp,
    verifyotpexpAt: Date.now() + 10 * 60 * 1000,
    isAccountVerify: false,
  });

  await user.save();

  await sendEmail(email, "Verify your account", `<p>Your OTP is <strong>${otp}</strong></p>`);

  res.status(201).json({
    success: true,
    requiresOtp: true,
    message: "OTP sent to email",
  });
};


/**
 * Login user (initiates OTP flow)
 */
export const verifyRegistrationOtp = async (req, res) => {
  const { email, otp } = req.body;

  const user = await usermodel.findOne({ email });
  if (!user) return res.status(404).json({ success: false, message: "User not found" });

  if (user.verifyotp !== otp || user.verifyotpexpAt < Date.now()) {
    return res.status(400).json({ success: false, message: "Invalid or expired OTP" });
  }

  user.isAccountVerify = true;
  user.verifyotp = "";
  user.verifyotpexpAt = 0;
  await user.save();

  const token = jwt.sign({ id: user._id, role: "user" }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });

  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  });

  res.json({
    success: true,
    user: { id: user._id, name: user.name, email: user.email },
  });
};

export const login = async (req, res) => {
  const { email, password } = req.body;

  const user = await usermodel.findOne({ email });
  if (!user) return res.status(401).json({ success: false, message: "Invalid credentials" });

  if (!user.isAccountVerify) {
    return res.status(403).json({ success: false, message: "Verify email first" });
  }

  if (user.isBlocked) {
    return res.status(403).json({ success: false, message: "Account blocked" });
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    return res.status(401).json({ success: false, message: "Invalid credentials" });
  }

  const token = jwt.sign({ id: user._id, role: "user" }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });

  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  });

  res.json({
    success: true,
    user: { id: user._id, name: user.name, email: user.email },
  });
};


/**
 * Logout user (clear cookie + blacklist token)
 * 
 * SECURITY: Token is now blacklisted server-side, making it
 * immediately invalid even if the cookie isn't properly cleared.
 */
export const logout = async (req, res) => {
  try {
    // SECURITY: Blacklist the current token
    const token = req.cookies?.token;
    if (token) {
      blacklistToken(token, 'user_logout');
    }

    res.clearCookie("token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV == "production" ? "none" : "lax",
    });
    return res.json({ success: true, message: "Logged out" });
  } catch (error) {
    res.json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Send verification OTP to email
 */
export const sendverifyotp = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await usermodel.findOne({ email });

    if (!user) {
      return res.json({ success: false, message: "User not found" });
    }

    if (user.isAccountVerify) {
      return res.json({ success: false, message: "Account already verified" });
    }

    // SECURITY FIX: Use cryptographically secure OTP
    const otp = generateSecureOTP();
    user.verifyotp = otp;
    user.verifyotpexpAt = Date.now() + 10 * 60 * 1000;
    await user.save();

    await sendEmail(user.email, "Login OTP", `<p>Your OTP is <strong>${otp}</strong></p>`);

    res.json({ success: true, message: "OTP sent to email" });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};

/**
 * Verify email with OTP
 */
export const verifyingEmail = async (req, res) => {
  const { userId, otp } = req.body;

  if (!userId || !otp) {
    return res.json({ success: false, message: "missing Details" });
  }
  try {
    const user = await usermodel.findById(userId);
    if (!user) {
      return res.json({ success: false, message: "user not found" });
    }

    if (user.verifyotp === "" || user.verifyotp !== otp) {
      return res.json({ success: false, message: "Invalid OTP" });
    }

    if (user.verifyotpexpAt < Date.now()) {
      return res.json({ success: false, message: "OTP expired" });
    }
    user.isAccountVerify = true;
    user.verifyotp = "";
    user.verifyotpexpAt = 0;
    await user.save();
    res.json({ success: true, message: "Email Verified successfully" });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};

/**
 * Check if user is authenticated
 */
export const isAuthenticated = async (req, res) => {
  try {
    const user = await usermodel.findById(req.userId); // SECURITY: from auth middleware (Issue #69)
    if (!user) {
      return res.json({ success: false, message: "User not found" });
    }
    return res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};

/**
 * Send password reset OTP
 */
export const sendResetpassword = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.json({
      success: true,
      message: "Email is required",
    });
  }
  try {
    const user = await usermodel.findOne({ email });
    if (!user) {
      return res.json({
        success: false,
        message: "User not found",
      });
    }

    // SECURITY FIX: Use cryptographically secure OTP
    const otp = generateSecureOTP();

    user.resetotp = otp;
    user.resetotpexpireAt = Date.now() + 15 * 60 * 1000; // 15 minutes (was 15 HOURS due to typo)
    await user.save();

    await sendEmail(user.email, "Account Verification OTP", `<p>Your OTP is <strong>${otp}</strong>. Use this to reset your password.</p>`);

    return res.json({ success: true, message: "OTP send to your email" });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};

/**
 * Reset user password with OTP verification
 */
export const resetpassword = async (req, res) => {
  const { email, otp, newpassword } = req.body;

  if (!email || !otp || !newpassword) {
    return res.status(400).json({
      success: false,
      message: "Email, OTP, and new password are required",
    });
  }

  if (newpassword.length < 8) {
    return res.status(400).json({
      success: false,
      message: "Password must be at least 8 characters",
    });
  }

  try {
    const user = await usermodel.findOne({ email });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // ✅ OTP checks
    if (!user.resetotp || user.resetotp !== otp) {
      return res.status(400).json({ success: false, message: "Invalid OTP" });
    }

    if (user.resetotpexpireAt < Date.now()) {
      return res.status(400).json({ success: false, message: "OTP expired" });
    }

    // ✅ Update password
    user.password = await bcrypt.hash(newpassword, 10);
    user.resetotp = "";
    user.resetotpexpireAt = 0;
    await user.save();

    // ✅ Auto login (optional but good UX)
    const token = jwt.sign(
      { id: user._id, role: "user" },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.json({
      success: true,
      message: "Password reset successful",
      autoLogin: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};


/**
 * Verify registration OTP
 */
// export const verifyRegistrationOtp = async (req, res) => {
//   const { email, otp } = req.body;
//   try {
//     const user = await usermodel.findOne({ email });
//     if (!user) {
//       return res.status(404).json({ success: false, message: "User not found" });
//     }

//     if (user.verifyotp !== otp) {
//       return res.status(400).json({ success: false, message: "Invalid OTP" });
//     }

//     if (user.verifyotpexpAt < Date.now()) {
//       return res.status(400).json({ success: false, message: "OTP expired" });
//     }

//     user.isAccountVerify = true;
//     user.verifyotp = '';
//     user.verifyotpexpAt = 0;
//     await user.save();

//     const token = jwt.sign({ id: user._id, role: 'user' }, process.env.JWT_SECRET, { expiresIn: "7d" });

//     res.cookie("token", token, {
//       httpOnly: true,
//       secure: process.env.NODE_ENV === "production",
//       sameSite: process.env.NODE_ENV == "production" ? "none" : "lax",
//       maxAge: 7 * 24 * 60 * 60 * 1000,
//     });

//     res.status(200).json({
//       success: true,
//       message: "Email verified successfully",
//       token,
//       user: { id: user._id, name: user.name, email: user.email }
//     });

//   } catch (error) {
//     console.error("Verify Registration OTP Error:", error);
//     res.status(500).json({ success: false, message: "Server error" });
//   }
// };

/**
 * Resend registration OTP
 */
// export const resendRegistrationOtp = async (req, res) => {
//   const { email } = req.body;
//   try {
//     const user = await usermodel.findOne({ email });
//     if (!user) {
//       return res.status(404).json({ success: false, message: "User not found" });
//     }

//     if (user.isAccountVerify) {
//       return res.status(400).json({ success: false, message: "Account already verified" });
//     }

//     // SECURITY FIX: Use cryptographically secure OTP
//     const otp = generateSecureOTP();
//     user.verifyotp = otp;
//     user.verifyotpexpAt = Date.now() + 24 * 60 * 60 * 1000;
//     await user.save();

//     const mailOption = {
//       from: process.env.SENDER_EMAIL,
//       to: email,
//       subject: "Verify your account",
//       text: `Your verification OTP is: ${otp}`,
//     };
//     await transporter.sendMail(mailOption);

//     res.status(200).json({ success: true, message: "OTP sent to email" });
//   } catch (error) {
//     console.error("Resend Registration OTP Error:", error);
//     res.status(500).json({ success: false, message: "Server error" });
//   }
// };
export const resendRegistrationOtp = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required"
      });
    }

    const user = await usermodel.findOne({ email });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    if (user.isAccountVerify) {
      return res.status(400).json({
        success: false,
        message: "Account already verified"
      });
    }

    const otp = generateSecureOTP();
    user.verifyotp = otp;
    user.verifyotpexpAt = Date.now() + 10 * 60 * 1000;
    await user.save();

    await sendEmail(email, "Verify your account", `<p>Your verification OTP is: <strong>${otp}</strong></p>`);

    res.json({ success: true });
  } catch (error) {
    console.error("Resend OTP Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};



/**
 * Logout user (session management)
 * 
 * SECURITY: Token is blacklisted server-side for proper session revocation.
 */
export const logoutUser = async (req, res) => {
  try {
    // SECURITY: Blacklist the current token
    const token = req.cookies?.token || req.token;
    if (token) {
      blacklistToken(token, 'user_logout');
    }

    res.clearCookie('token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
    });
    return res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error("Logout Error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * Get current authenticated user
 */
export const getMe = async (req, res) => {
  try {
    const userId = req.userId;
    const user = await usermodel.findById(userId).select("-password");

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.status(200).json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        isAccountVerified: user.isAccountVerify,
      }
    });
  } catch (error) {
    console.error("Get Me Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};