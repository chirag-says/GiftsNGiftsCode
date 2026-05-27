import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import Admin from '../model/adminModel.js';
import orderModel from '../model/order.js';
import sellermodel from '../model/sellermodel.js';
import addproductmodel from '../model/addproduct.js';
import usermodel from "../model/mongobd_usermodel.js";
import Review from '../model/review.js';
import ExcelJS from 'exceljs';
// Adjust path to your Order model
import PayoutModel from "../model/payout.js"; // Adjust path to your Payout model
import { Coupon, Banner, Campaign, FlashSale, AffiliateSettings } from '../model/marketingModel.js';
import { sendEmail } from "../config/mail.js";
import { notifySellerApprovalChange } from '../services/notificationService.js';
import { transitionOrder } from '../services/orderLifecycleService.js';
// SECURITY: Import token blacklist for proper session revocation
import { blacklistToken } from '../utils/tokenBlacklist.js';
import { escapeRegex } from '../utils/errorHandler.js';
// ... (Authentication functions remain the same) ...

const getAdminIdFromRequest = (req) => {
  let token;

  // Check for token in Authorization header
  if (req.headers?.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }
  // Check for token in cookies
  else if (req.cookies && req.cookies.admin_token) {
    token = req.cookies.admin_token;
  }

  if (!token) {
    const error = new Error('Unauthorized');
    error.statusCode = 401;
    throw error;
  }

  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  return decoded.id;
};

export const registerAdmin = async (req, res) => {
  // ... existing code ...
  try {
    const { name, email, password } = req.body;

    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
      return res.json({ success: false, message: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newAdmin = await Admin.create({
      name,
      email,
      password: hashedPassword,
    });

    const token = jwt.sign({ id: newAdmin._id, role: 'admin' }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.json({
      success: true,
      message: "Registered successfully",
      token,
      name: newAdmin.name,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const loginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;

    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.json({ success: false, message: "Invalid email or password" });
    }

    // Check if admin is blocked (if field exists)
    if (admin.isBlocked) {
      return res.status(403).json({ success: false, message: "Admin account is blocked" });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.json({ success: false, message: "Invalid email or password" });
    }

    const token = jwt.sign({ id: admin._id, role: 'admin' }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    // Set HttpOnly cookie
    res.cookie('admin_token', token, {
      httpOnly: true,
      secure: true, // Required for SameSite=None, works on localhost
      sameSite: 'none', // Required for cross-origin (different ports)
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.json({
      success: true,
      message: "Login successful",
      token,
      user: { name: admin.name },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const logoutAdmin = async (req, res) => {
  try {
    // SECURITY: Extract token for blacklisting
    let token = req.cookies?.admin_token;

    // Also check Authorization header as fallback
    if (!token && req.headers?.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    // SECURITY: Blacklist the token to immediately invalidate it
    // This prevents the JWT from being reused even if someone intercepted it
    if (token) {
      blacklistToken(token, 'admin_logout');
      console.log('🔒 Admin token blacklisted on logout');
    }

    // Clear the cookie
    res.clearCookie('admin_token', {
      httpOnly: true,
      secure: true,
      sameSite: 'none'
    });

    res.json({ success: true, message: "Logged out successfully" });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getAdminProfile = async (req, res) => {
  try {
    const adminId = getAdminIdFromRequest(req);
    const admin = await Admin.findById(adminId).select('name email createdAt updatedAt');

    if (!admin) {
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }

    res.status(200).json({ success: true, admin });
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({ success: false, message: error.message });
  }
};

export const updateAdminProfile = async (req, res) => {
  try {
    const adminId = getAdminIdFromRequest(req);
    const admin = await Admin.findById(adminId);

    if (!admin) {
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }

    const { name, email, currentPassword, newPassword } = req.body;

    if (email && email !== admin.email) {
      const existing = await Admin.findOne({ email });
      if (existing) {
        return res.status(400).json({ success: false, message: 'Email already in use' });
      }
      admin.email = email;
    }

    if (name) {
      admin.name = name;
    }

    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ success: false, message: 'Current password is required' });
      }

      const isMatch = await bcrypt.compare(currentPassword, admin.password);
      if (!isMatch) {
        return res.status(400).json({ success: false, message: 'Current password is incorrect' });
      }

      admin.password = await bcrypt.hash(newPassword, 10);
    }

    await admin.save();

    res.status(200).json({
      success: true,
      message: 'Profile updated',
      admin: { name: admin.name, email: admin.email }
    });
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }
    const status = error.statusCode || 500;
    res.status(status).json({ success: false, message: error.message });
  }
};

// ... (User management remains the same) ...
export const userlist = async (req, res) => {
  try {
    const users = await usermodel.find().select('name email isBlocked createdAt');
    if (!users || users.length === 0) {
      return res.json({ success: false, message: "No users found" });
    }
    return res.json({ success: true, users });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const toggleUserBlock = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await usermodel.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    const updatedUser = await usermodel.findByIdAndUpdate(
      userId,
      { isBlocked: !user.isBlocked },
      { new: true }
    ).select('name email isBlocked createdAt');

    return res.status(200).json({
      success: true,
      message: `User ${updatedUser.isBlocked ? "blocked" : "unblocked"} successfully.`,
      user: updatedUser,
    });
  } catch (error) {
    console.error("Error toggling user block status:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

export const toggleApprove = async (req, res) => {
  try {
    const { sellerId } = req.params;
    const seller = await sellermodel.findById(sellerId);
    if (!seller) {
      return res.status(404).json({ message: "Seller not found" });
    }
    const updatedSeller = await sellermodel.findByIdAndUpdate(
      sellerId,
      { approved: !seller.approved },
      { new: true }
    );

    // --- Dispatch Notification (Fire and Forget) ---
    (async () => {
      try {
        await notifySellerApprovalChange({
          sellerEmail: updatedSeller.email,
          sellerName: updatedSeller.name,
          sellerId: updatedSeller._id,
          isApproved: updatedSeller.approved
        });
      } catch (notifErr) {
        console.error("Failed to send seller approval notification:", notifErr);
      }
    })();

    return res.status(200).json({
      success: true,
      message: `Seller ${updatedSeller.approved ? "approved" : "disapproved"} successfully.`,
      seller: updatedSeller,
    });
  } catch (error) {
    console.error("Error toggling seller approval:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

// ... (Product/Order management remain the same) ...
export const getAllProducts = async (req, res) => {
  try {
    const products = await addproductmodel.find({}).populate("sellerId", "name");
    if (!products || products.length === 0) {
      return res.status(404).json({ success: false, message: "No products found" });
    }
    return res.status(200).json({ success: true, products });
  } catch (error) {
    console.error("Error fetching products:", error);
    return res.status(500).json({ success: false, message: "Server Error" });
  }
};

export const approveProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    const product = await addproductmodel.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    const updatedProduct = await addproductmodel.findByIdAndUpdate(
      productId,
      { approved: !product.approved },
      { new: true }
    );
    return res.status(200).json({
      success: true,
      message: `Product ${updatedProduct.approved ? "approved" : "disapproved"} successfully.`,
      product: updatedProduct,
    });
  } catch (error) {
    console.error("Error toggling product approval:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

export const getProductsBySeller = async (req, res) => {
  try {
    const { sellerId } = req.params;
    const products = await addproductmodel.find({ sellerId });
    return res.status(200).json({ success: true, products });
  } catch (err) {
    console.error("Error fetching seller products:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const getAllOrders = async (req, res) => {

  try {

    const orders = await orderModel
      .find({})
      .populate("user", "name email")
      .populate("items.productId", "title price images")
      .populate("items.sellerId", "name email nickName")
      .sort({ placedAt: -1 });

    const formattedOrders = orders.map(order => ({

      _id: order._id,

      user: order.user,

      totalAmount: order.totalAmount,

      status: order.status,

      placedAt: order.placedAt,

      paymentId: order.paymentId,

      image: order.image,

      shippingAddress: {

        name: order.shippingAddress?.name || "",

        address: order.shippingAddress?.address || "",

        city: order.shippingAddress?.city || "",

        state: order.shippingAddress?.state || "",

        pin: order.shippingAddress?.pin || "",

        phone: order.shippingAddress?.phone || "",

        alternatephone: order.shippingAddress?.alternatephone || ""

      },

      items: order.items.map(item => ({

        _id: item._id,

        productId: item.productId,

        sellerId: item.sellerId,

        name: item.name,

        quantity: item.quantity,

        price: item.price,

        status: item.status,

        giftMessage: item.giftMessage || "",

        senderName: item.senderName || "",

        receiverName: item.receiverName || ""

      }))

    }));


    res.status(200).json({

      success: true,

      orders: formattedOrders

    });

  } catch (error) {

    console.error(error);

    res.status(500).json({

      success: false,

      message: "Failed to fetch orders"

    });

  }

};

/**
 * Issue #15: Admin Order Status Management
 * ARCHITECTURE: Uses centralized orderLifecycleService — SINGLE owner of transitions
 * Admin has full permissions for all transitions.
 */
export const adminUpdateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status, reason } = req.body;

    if (!status) {
      return res.status(400).json({ success: false, message: "Status is required" });
    }

    const order = await orderModel.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const previousStatus = order.status;

    // Use centralized lifecycle service — single source of truth
    const result = await transitionOrder(orderId, status, 'admin', {
      reason,
      actorId: req.adminId,
      requestId: req.requestId
    });

    if (!result.success) {
      return res.status(400).json({ success: false, message: result.error });
    }

    // Fire-and-forget: Notify buyer about status change
    (async () => {
      try {
        const { notifyBuyerStatusChange } = await import('../services/notificationService.js');
        const user = await usermodel.findById(order.user).select('name email');
        if (user) {
          await notifyBuyerStatusChange({
            buyerEmail: user.email,
            buyerName: user.name,
            orderId: order._id,
            oldStatus: result.previousStatus || previousStatus,
            newStatus: status
          });
        }
      } catch (e) {
        console.error('Admin order notification error:', e.message);
      }
    })();

    res.status(200).json({
      success: true,
      message: `Order status updated to "${status}"`,
      order: result.order
    });
  } catch (error) {
    console.error('Admin update order error:', error);
    res.status(500).json({ success: false, message: "Failed to update order status" });
  }
};

export const getDashboardStats = async (req, res) => {
  try {
    const totalOrders = await orderModel.countDocuments({});
    const totalProducts = await addproductmodel.countDocuments({});
    const totalSellers = await sellermodel.countDocuments({});
    const totalUsers = await usermodel.countDocuments({});
    const orders = await orderModel.find({ status: { $ne: "Cancelled" } });
    const totalRevenue = orders.reduce((acc, order) => acc + (order.totalAmount || 0), 0);
    const monthlyRevenue = await orderModel.aggregate([
      {
        $match: {
          status: { $ne: "Cancelled" },
          placedAt: { $gte: new Date(new Date().setMonth(new Date().getMonth() - 6)) }
        }
      },
      {
        $group: {
          _id: { $month: "$placedAt" },
          total: { $sum: "$totalAmount" }
        }
      },
      { $sort: { "_id": 1 } }
    ]);
    const activeSellers = await sellermodel.countDocuments({ approved: true });
    const pendingSellers = await sellermodel.countDocuments({ approved: false });
    res.json({
      success: true,
      stats: {
        totalOrders,
        totalRevenue,
        totalProducts,
        totalSellers,
        totalUsers,
        activeSellers,
        pendingSellers,
        monthlyRevenue
      }
    });
  } catch (error) {
    console.error(error);
    res.json({ success: false, message: error.message });
  }
};

export const getRecentActivities = async (req, res) => {
  try {
    const recentOrders = await orderModel.find()
      .select('totalAmount placedAt _id')
      .sort({ placedAt: -1 })
      .limit(3)
      .lean();
    const newSellers = await sellermodel.find()
      .select('name createdAt')
      .sort({ createdAt: -1 })
      .limit(2)
      .lean();
    let activities = [];
    recentOrders.forEach(order => {
      activities.push({
        id: order._id,
        text: `New Order #${order._id.toString().slice(-6).toUpperCase()} of ₹${order.totalAmount}`,
        time: order.placedAt,
        type: 'order'
      });
    });
    newSellers.forEach(seller => {
      activities.push({
        id: seller._id,
        text: `New Seller '${seller.name}' joined the platform`,
        time: seller.createdAt,
        type: 'user'
      });
    });
    activities.sort((a, b) => new Date(b.time) - new Date(a.time));
    res.json({ success: true, activities });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

export const getAdminProducts = async (req, res) => {
  try {
    const { type } = req.query;
    let query = {};
    if (type === 'pending') {
      query.approved = false;
    } else if (type === 'featured') {
      query.isFeatured = true;
    } else if (type === 'out-of-stock') {
      query.stock = { $lte: 0 };
    }
    const products = await addproductmodel.find(query)
      .populate('categoryname')
      .populate('sellerId', 'name email')
      .sort({ createdAt: -1 });
    res.json({ success: true, products });
  } catch (error) {
    console.error("Error in getAdminProducts:", error);
    res.status(500).json({ success: false, message: "Server Error", error: error.message });
  }
};

export const toggleFeatured = async (req, res) => {
  try {
    const product = await addproductmodel.findById(req.params.id);
    if (product) {
      product.isFeatured = !product.isFeatured;
      await product.save();
      res.json({ success: true, message: "Featured status updated" });
    } else {
      res.status(404).json({ success: false, message: "Product not found" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
}

export const getAllReviews = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, status } = req.query;
    let query = {};

    if (status && status !== 'All') {
      query.status = status;
    }

    if (search) {
      const safeSearch = escapeRegex(search);
      query.$or = [
        { userName: { $regex: safeSearch, $options: "i" } },
        { comment: { $regex: safeSearch, $options: "i" } },
        { title: { $regex: safeSearch, $options: "i" } }
      ];
    }

    const reviews = await Review.find(query)
      .populate({
        path: "productId",
        select: "title images sellerId",
        populate: {
          path: "sellerId",
          select: "name email"
        }
      })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const totalReviews = await Review.countDocuments(query);

    // Stats for the "Analysis" tab
    const pendingCount = await Review.countDocuments({ status: "Pending" });
    const reportedCount = await Review.countDocuments({ status: "Reported" });

    const allReviews = await Review.find({});
    const avgRating = allReviews.length > 0
      ? (allReviews.reduce((acc, r) => acc + r.rating, 0) / allReviews.length).toFixed(1)
      : 0;

    res.status(200).json({
      success: true,
      data: {
        reviews,
        stats: { totalReviews, avgRating, pendingCount, reportedCount },
        pagination: { currentPage: Number(page), totalPages: Math.ceil(totalReviews / limit) }
      }
    });
  } catch (error) {
    console.error("Admin All Reviews Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

export const updateReviewStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const review = await Review.findByIdAndUpdate(id, { status }, { new: true });
    res.json({ success: true, message: "Review status updated", review });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


export const deleteReview = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedReview = await Review.findByIdAndDelete(id);
    if (!deletedReview) {
      return res.status(404).json({ success: false, message: "Review not found" });
    }
    res.status(200).json({ success: true, message: "Review deleted successfully" });
  } catch (error) {
    console.error("Delete Review Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};



// ... (keep other imports)

// 1. Get All Sellers (Updated with ID Search & Region Filter)
export const getAllSellers = async (req, res) => {
  try {
    const { search, region } = req.query;

    const query = {};

    // 3. Region Filter
    if (region && region !== 'all') {
      // Case-insensitive regex match for region
      query.region = { $regex: escapeRegex(region), $options: "i" };
    }

    // 1. & 2. Search by Name OR Unique ID OR Email
    if (search) {
      const safeSearch = escapeRegex(search);
      query.$or = [
        { name: { $regex: safeSearch, $options: "i" } },
        { uniqueId: { $regex: safeSearch, $options: "i" } }, // 5. Search by Unique ID
        { email: { $regex: safeSearch, $options: "i" } }
      ];
      // Search by Phone if numeric
      if (!isNaN(search)) {
        query.$or.push({ phone: Number(search) });
      }
    }

    // Sort by region if selected, otherwise by creation date
    const sortLogic = region ? { region: 1 } : { createdAt: -1 };

    const sellers = await sellermodel.find(query).select("-password").sort(sortLogic);

    // ... (Keep your existing code for calculating stats/orders if you had it here)

    res.json({ success: true, sellers });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// 4. NEW FUNCTION: Check Inactive Vendors and Mail Admin
export const checkInactiveVendors = async (req, res) => {
  try {
    const oneMonthAgo = new Date();
    oneMonthAgo.setDate(oneMonthAgo.getDate() - 30);

    // Find active sellers who haven't logged in for > 30 days
    const inactiveSellers = await sellermodel.find({
      lastLogin: { $lt: oneMonthAgo },
      status: 'Active'
    });

    if (inactiveSellers.length === 0) {
      return res.json({ success: true, message: "No inactive vendors found." });
    }

    // Create HTML Table for Email
    let tableRows = inactiveSellers.map(seller => `
            <tr>
                <td>${seller.uniqueId || 'N/A'}</td>
                <td>${seller.name}</td>
                <td>${seller.region || 'N/A'}</td>
                <td>${seller.phone}</td>
                <td>${seller.lastLogin ? new Date(seller.lastLogin).toLocaleDateString() : 'Never'}</td>
            </tr>
        `).join('');

    const emailContent = `
            <h2>Inactive Vendor Alert</h2>
            <p>The following vendors have been inactive (no login) for more than 30 days:</p>
            <table border="1" cellpadding="5" cellspacing="0" style="width: 100%; border-collapse: collapse;">
                <thead style="background: #f3f3f3;">
                    <tr>
                        <th>Unique ID</th>
                        <th>Name</th>
                        <th>Region</th>
                        <th>Phone</th>
                        <th>Last Active</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows}
                </tbody>
            </table>
        `;

    // Send Email to Admin
    const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";
    await sendEmail(ADMIN_EMAIL, "Alert: Monthly Inactive Vendors Report", emailContent);

    res.json({
      success: true,
      message: `Report sent for ${inactiveSellers.length} inactive sellers.`,
      count: inactiveSellers.length
    });

  } catch (error) {
    console.error("Inactive Vendor Check Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export const getSellerInactivityReport = async (req, res) => {
  try {
    const minDays = Math.max(1, Number(req.query.minDays) || 30);
    const thresholdDate = new Date(Date.now() - minDays * DAY_IN_MS);

    const candidates = await sellermodel.find({
      $or: [
        { lastProductPostedAt: { $exists: false } },
        { lastProductPostedAt: { $lt: thresholdDate } }
      ]
    }).select("name email phone region uniqueId lastProductPostedAt inactiveSince date inactiveNotificationSentAt");

    const report = candidates
      .map((seller) => {
        const lastListing = seller.lastProductPostedAt || seller.inactiveSince || seller.date;
        if (!lastListing) return null;
        const inactiveDays = Math.floor((Date.now() - new Date(lastListing).getTime()) / DAY_IN_MS);

        return {
          _id: seller._id,
          name: seller.name,
          email: seller.email,
          phone: seller.phone,
          region: seller.region,
          uniqueId: seller.uniqueId,
          lastListing,
          inactiveDays,
          lastNotificationSentAt: seller.inactiveNotificationSentAt
        };
      })
      .filter((entry) => entry && entry.inactiveDays >= minDays)
      .sort((a, b) => b.inactiveDays - a.inactiveDays);

    res.status(200).json({ success: true, minDays, sellers: report });
  } catch (error) {
    console.error("Seller inactivity report error", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ... (Keep other exports like registerAdmin, loginAdmin, getAllOrders etc.)
// ... export other existing functions (getDashboardStats, etc.)
export const toggleSellerApproval = async (req, res) => {
  try {
    const { id } = req.params;
    const seller = await sellermodel.findById(id);
    if (!seller) return res.json({ success: false, message: "Seller not found" });

    // Toggle logic: If Active -> Suspended. If Pending/Suspended -> Active.
    if (seller.status === 'Active') {
      seller.status = 'Suspended';
      seller.approved = false;
    } else {
      seller.status = 'Active';
      seller.approved = true;
    }

    await seller.save();

    // --- Dispatch Notification (Fire and Forget) ---
    (async () => {
      try {
        await notifySellerApprovalChange({
          sellerEmail: seller.email,
          sellerName: seller.name,
          sellerId: seller._id,
          isApproved: seller.approved
        });
      } catch (notifErr) {
        console.error("Failed to send seller status toggle notification:", notifErr);
      }
    })();

    res.json({ success: true, message: `Seller ${seller.status}`, seller });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};

export const updateSellerCommission = async (req, res) => {
  try {
    const { id } = req.params;
    const { commissionRate } = req.body;
    const seller = await sellermodel.findByIdAndUpdate(
      id,
      { commissionRate: commissionRate },
      { new: true }
    );
    res.json({ success: true, message: "Commission updated", seller });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};

export const getSellerProducts = async (req, res) => {
  try {
    const { id } = req.params;
    const products = await addproductmodel.find({ sellerId: id });
    res.json({ success: true, products });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};


// 1. All Transactions (Master Ledger)
export const getAllTransactions = async (req, res) => {
  try {
    // Fetch Orders (Incoming Funds)
    const orders = await orderModel.find({})
      .select("totalAmount paymentMethod status placedAt _id")
      .sort({ placedAt: -1 });

    // Fetch Payouts (Outgoing Funds)
    const payouts = await PayoutModel.find({})
      .populate("sellerId", "name")
      .sort({ requestedAt: -1 });

    // Normalize Data
    const transactions = [
      ...orders.map(o => ({
        id: o._id,
        type: "Credit", // Money in
        entity: "Customer Order",
        amount: o.totalAmount,
        date: o.placedAt,
        status: o.status,
        method: o.paymentMethod
      })),
      ...payouts.map(p => ({
        id: p._id,
        type: "Debit", // Money out
        entity: `Payout to ${p.sellerId?.name || 'Vendor'}`,
        amount: p.amount,
        date: p.requestedAt,
        status: p.status,
        method: p.paymentMethod
      }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({ success: true, transactions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 2. Vendor Payouts (Management)
export const getVendorPayouts = async (req, res) => {
  try {
    // Get pending payouts specifically
    const pending = await PayoutModel.find({ status: "Pending" })
      .populate("sellerId", "name email bankDetails");

    // Get history
    const history = await PayoutModel.find({ status: { $ne: "Pending" } })
      .populate("sellerId", "name")
      .limit(20);

    res.json({ success: true, pending, history });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Action: Approve/Reject Payout
export const processPayout = async (req, res) => {
  try {
    const { payoutId, status, transactionId } = req.body; // status: 'Completed' or 'Rejected'
    const payout = await PayoutModel.findByIdAndUpdate(
      payoutId,
      { status, transactionId, processedAt: new Date() },
      { new: true }
    );
    res.json({ success: true, message: `Payout ${status}`, payout });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 3. Pending Settlements (Funds on Hold)
export const getPendingSettlements = async (req, res) => {
  try {
    // Logic: Orders Delivered but less than 7 days ago (Return period)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const settlements = await orderModel.find({
      status: "Delivered",
      updatedAt: { $gte: sevenDaysAgo } // Delivered recently, funds held
    }).populate("items.sellerId", "name");

    const totalHeld = settlements.reduce((sum, order) => sum + order.totalAmount, 0);

    res.json({ success: true, settlements, totalHeld });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 4. Commission Reports
export const getCommissionReport = async (req, res) => {
  try {
    const commissionRate = 0.10; // 10% example

    const orders = await orderModel.find({ status: { $in: ["Delivered", "Completed"] } });

    let totalGMV = 0;
    let totalCommission = 0;

    orders.forEach(order => {
      totalGMV += order.totalAmount;
      totalCommission += (order.totalAmount * commissionRate);
    });

    res.json({ success: true, totalGMV, totalCommission, rate: "10%" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 5. Refund Management
export const getRefunds = async (req, res) => {
  try {
    const refunds = await orderModel.find({
      status: { $in: ["Cancelled", "Returned", "Refunded"] }
    }).sort({ updatedAt: -1 });

    res.json({ success: true, refunds });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 7. Financial Reports (Analytics)
export const getFinancialStats = async (req, res) => {
  try {
    const revenue = await orderModel.aggregate([
      { $match: { status: "Delivered" } },
      { $group: { _id: null, total: { $sum: "$totalAmount" } } }
    ]);

    const payouts = await PayoutModel.aggregate([
      { $match: { status: "Completed" } },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);

    res.json({
      success: true,
      stats: {
        totalRevenue: revenue[0]?.total || 0,
        totalPayouts: payouts[0]?.total || 0,
        netProfit: (revenue[0]?.total || 0) * 0.10 // Assuming 10% profit margin
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
export const getInventoryData = async (req, res) => {
  try {
    const products = await addproductmodel.find({}).select("title stock price category");

    // Logic for Low Stock (e.g., less than 10)
    const lowStockItems = products.filter(p => p.stock < 10);

    // Calculate total inventory value
    const totalValue = products.reduce((acc, item) => acc + (item.price * item.stock), 0);

    res.json({
      success: true,
      totalProducts: products.length,
      lowStockCount: lowStockItems.length,
      totalValue,
      inventory: products,
      lowStockItems
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Bulk Update Stock
export const updateStock = async (req, res) => {
  try {
    const { productId, newStock } = req.body;
    await addproductmodel.findByIdAndUpdate(productId, { stock: newStock });
    res.json({ success: true, message: "Stock updated" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// --- MARKETING CONTROLLERS ---


export const createCoupon = async (req, res) => {
  try {
    const { code, value, expiryDate, discountType } = req.body;
    const newCoupon = new Coupon({ code, value, expiryDate, discountType });
    await newCoupon.save();
    res.json({ success: true, message: "Coupon created" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createCampaign = async (req, res) => {
  try {
    const campaign = new Campaign(req.body);
    await campaign.save();
    res.json({ success: true, message: "Campaign created", campaign });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


export const createFlashSale = async (req, res) => {
  try {
    const sale = new FlashSale(req.body);
    await sale.save();
    res.json({ success: true, message: "Flash Sale Created", sale });
  } catch (e) { res.status(500).json({ success: false, map: e.message }); }
};

export const createBanner = async (req, res) => {
  try {
    const banner = new Banner(req.body);
    await banner.save();
    res.json({ success: true, message: "Banner Created", banner });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
};

export const deleteBanner = async (req, res) => {
  try {
    await Banner.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Banner Deleted" });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
};

export const updateAffiliateSettings = async (req, res) => {
  try {
    let settings = await AffiliateSettings.findOne();
    if (!settings) settings = new AffiliateSettings();
    Object.assign(settings, req.body);
    await settings.save();
    res.json({ success: true, message: "Affiliate Settings Updated", settings });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
};

export const getMarketingData = async (req, res) => {
  try {
    const coupons = await Coupon.find({});
    const banners = await Banner.find({});
    const campaigns = await Campaign.find({});
    const flashSales = await FlashSale.find({});
    const affiliate = await AffiliateSettings.findOne() || {};
    res.json({ success: true, coupons, banners, campaigns, flashSales, affiliate });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// --- ANALYTICS CONTROLLER (Advanced) ---

export const getAdvancedAnalytics = async (req, res) => {
  try {
    // Aggregation for Revenue per Month
    const revenueData = await orderModel.aggregate([
      { $match: { status: { $ne: "Cancelled" } } }, // Exclude cancelled
      {
        $group: {
          _id: { $month: "$placedAt" },
          totalRevenue: { $sum: "$totalAmount" },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({ success: true, revenueData });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const exportSalesReport = async (req, res) => {
  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Sales Report');

    // Define Columns
    worksheet.columns = [
      { header: 'Order ID', key: '_id', width: 25 },
      { header: 'Customer Name', key: 'name', width: 20 },
      { header: 'Date', key: 'date', width: 15 },
      { header: 'Payment Status', key: 'payment', width: 15 },
      { header: 'Order Status', key: 'status', width: 15 },
      { header: 'Amount (₹)', key: 'amount', width: 15 },
    ];

    // Style Header Row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };

    // Fetch Data
    const orders = await orderModel.find({}).sort({ placedAt: -1 });

    // Add Rows
    orders.forEach(order => {
      worksheet.addRow({
        _id: order._id.toString(),
        name: order.shippingAddress?.name || 'Guest',
        date: new Date(order.placedAt).toLocaleDateString(),
        payment: order.paymentId ? 'Online' : 'COD',
        status: order.status,
        amount: order.totalAmount
      });
    });

    // Total Row
    const totalAmount = orders.reduce((sum, order) => sum + order.totalAmount, 0);
    worksheet.addRow({}); // Empty row
    worksheet.addRow({ status: 'Total Revenue:', amount: totalAmount }).font = { bold: true };

    // Set Response Headers
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=' + 'Sales_Report.xlsx'
    );

    // Write to response
    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
    console.error("Export Error:", error);
    res.status(500).json({ success: false, message: "Could not generate report" });
  }
};

export const getReviewAnalytics = async (req, res) => {
  try {
    const { type } = req.query;

    // 1. Product Ratings (Grouped by Product)
    if (type === 'products') {
      const stats = await Review.aggregate([
        {
          $lookup: {
            from: "products",
            localField: "productId",
            foreignField: "_id",
            as: "product"
          }
        },
        { $unwind: "$product" },
        {
          $group: {
            _id: "$product._id",
            title: { $first: "$product.title" },
            image: { $first: { $arrayElemAt: ["$product.images.url", 0] } },
            sellerId: { $first: "$product.sellerId" },
            avgRating: { $avg: "$rating" },
            count: { $sum: 1 }
          }
        },
        { $sort: { avgRating: -1, count: -1 } }
      ]);
      return res.json({ success: true, data: stats });
    }

    // 2. Vendor Ratings (Grouped by Seller)
    if (type === 'vendors') {
      const stats = await Review.aggregate([
        {
          $lookup: {
            from: "products",
            localField: "productId",
            foreignField: "_id",
            as: "product"
          }
        },
        { $unwind: "$product" },
        {
          $lookup: {
            from: "sellers",
            localField: "product.sellerId",
            foreignField: "_id",
            as: "seller"
          }
        },
        { $unwind: "$seller" },
        {
          $group: {
            _id: "$seller._id",
            name: { $first: "$seller.name" },
            email: { $first: "$seller.email" },
            avgRating: { $avg: "$rating" },
            count: { $sum: 1 }
          }
        },
        { $sort: { avgRating: -1 } }
      ]);
      return res.json({ success: true, data: stats });
    }

    // 3. General Analytics (Default)
    const totalReviews = await Review.countDocuments();
    const avgRatingRes = await Review.aggregate([{ $group: { _id: null, avg: { $avg: '$rating' } } }]);

    // Rating Distribution
    const distribution = await Review.aggregate([
      { $group: { _id: "$rating", count: { $sum: 1 } } },
      { $sort: { "_id": -1 } }
    ]);

    res.json({
      success: true,
      data: {
        totalReviews,
        avgRating: avgRatingRes[0]?.avg?.toFixed(1) || 0,
        distribution
      }
    });

  } catch (error) {
    console.error("Analytics Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Admin Delete Product
 * 
 * Allows admins to delete any product (no ownership restriction)
 * Used by the Admin Panel for product management
 */
export const adminDeleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Product ID is required"
      });
    }

    // Admin can delete any product
    const deletedProduct = await addproductmodel.findByIdAndDelete(id);

    if (!deletedProduct) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }

    res.json({
      success: true,
      message: "Product deleted successfully",
      deletedId: deletedProduct._id
    });
  } catch (error) {
    console.error("Admin Delete Product Error:", error);
    res.status(500).json({ success: false, message: 'Failed to delete product' });
  }
};

// ========================= HOMEPAGE COLLECTION MANAGEMENT =========================

/**
 * Get products for homepage collections (Best of North East & Under ₹999)
 * Also returns all approved products for selection
 */
export const getHomeCollections = async (req, res) => {
  try {
    // Get products in "Best of North East"
    const bestOfNorthEast = await addproductmodel.find({
      showInBestOfNorthEast: true,
      approved: true,
      isAvailable: true
    })
      .select('title price images state rating stock')
      .populate('sellerId', 'name')
      .limit(20);

    // Get products in "Under ₹999"
    const under999 = await addproductmodel.find({
      showInUnder999: true,
      approved: true,
      isAvailable: true
    })
      .select('title price images state rating stock')
      .populate('sellerId', 'name')
      .limit(20);

    // Get all approved products for selection dropdown
    const allProducts = await addproductmodel.find({
      approved: true,
      isAvailable: true
    })
      .select('title price images state rating stock showInBestOfNorthEast showInUnder999')
      .populate('sellerId', 'name')
      .sort({ createdAt: -1 })
      .limit(200);

    res.json({
      success: true,
      data: {
        bestOfNorthEast,
        under999,
        allProducts
      }
    });
  } catch (error) {
    console.error("Get Home Collections Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Toggle product in "Best of North East" collection
 */
export const toggleBestOfNorthEast = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await addproductmodel.findById(id);

    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    product.showInBestOfNorthEast = !product.showInBestOfNorthEast;
    await product.save();

    res.json({
      success: true,
      message: product.showInBestOfNorthEast
        ? "Added to Best of North East"
        : "Removed from Best of North East",
      product: {
        _id: product._id,
        title: product.title,
        showInBestOfNorthEast: product.showInBestOfNorthEast
      }
    });
  } catch (error) {
    console.error("Toggle Best of NE Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Toggle product in "Perfect Gifts Under ₹999" collection
 */
export const toggleUnder999 = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await addproductmodel.findById(id);

    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    product.showInUnder999 = !product.showInUnder999;
    await product.save();

    res.json({
      success: true,
      message: product.showInUnder999
        ? "Added to Under ₹999"
        : "Removed from Under ₹999",
      product: {
        _id: product._id,
        title: product.title,
        showInUnder999: product.showInUnder999
      }
    });
  } catch (error) {
    console.error("Toggle Under 999 Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Bulk update collections - set multiple products at once
 * Body: { bestOfNorthEast: [productIds], under999: [productIds] }
 */
export const updateHomeCollections = async (req, res) => {
  try {
    const { bestOfNorthEast = [], under999 = [] } = req.body;

    // First, reset all products
    await addproductmodel.updateMany(
      {},
      { showInBestOfNorthEast: false, showInUnder999: false }
    );

    // Set Best of North East products
    if (bestOfNorthEast.length > 0) {
      await addproductmodel.updateMany(
        { _id: { $in: bestOfNorthEast } },
        { showInBestOfNorthEast: true }
      );
    }

    // Set Under ₹999 products
    if (under999.length > 0) {
      await addproductmodel.updateMany(
        { _id: { $in: under999 } },
        { showInUnder999: true }
      );
    }

    res.json({
      success: true,
      message: "Homepage collections updated successfully",
      counts: {
        bestOfNorthEast: bestOfNorthEast.length,
        under999: under999.length
      }
    });
  } catch (error) {
    console.error("Update Home Collections Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};
