import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import validator from "validator";
import sellermodel from "../model/sellermodel.js";
import addproductmodel from "../model/addproduct.js";
import { v2 as cloudinary } from "cloudinary";
import orderModel from "../model/order.js";
import usermodel from "../model/mongobd_usermodel.js";
import { sendEmail } from "../config/mail.js";
import SellerNotification from "../model/sellerNotification.js";
import { notifyBuyerStatusChange } from "../services/notificationService.js";
import { processFullRefund } from "../services/refundService.js";
import { restoreCancelledStock } from "../services/stockReservationService.js";
// ================= UNIQUE SELLER ID GENERATOR =================
const generateSellerUniqueId = (pincode, nickName) => {
  const pinSuffix = pincode.toString().slice(-3);        // last 3 digits of pincode
  const shopInitial = nickName.charAt(0).toUpperCase();  // first letter of nickname
  const randomDigits = crypto.randomInt(10, 99); // 2 cryptographically random digits

  return `GNGDEL${pinSuffix}${shopInitial}${randomDigits}`;
};

const SELLER_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: "/"
};



// ========================= REGISTER SELLER =========================
// ========================= REGISTER SELLER (OTP ONLY) =========================
export const registerseller = async (req, res) => {
  try {
    const { name, email, password, nickName, phone, street, city, state, pincode, region } = req.body;

    if (!name || !email || !password || !nickName || !phone || !street || !city || !state || !pincode) {
      return res.json({ success: false, message: "All fields are required" });
    }

    const sanitizedEmail = validator.normalizeEmail(email.trim().toLowerCase());
    if (!sanitizedEmail || !validator.isEmail(sanitizedEmail)) {
      return res.json({ success: false, message: "Invalid email format" });
    }

    const existing = await sellermodel.findOne({ email: sanitizedEmail });
    if (existing) {
      return res.json({ success: false, message: "Seller already exists" });
    }

    if (password.length < 8) {
      return res.json({ success: false, message: "Password must be at least 8 characters" });
    }

    const otp = crypto.randomInt(100000, 999999).toString();

    // SECURITY: Hash password BEFORE putting in JWT (Issue #1 fix)
    // The JWT is sent to the client — plaintext password must NEVER be in it
    const hashedPassword = await bcrypt.hash(password, 10);

    // TEMP REGISTRATION TOKEN (10 mins)
    const tempToken = jwt.sign(
      {
        name,
        email: sanitizedEmail,
        password: hashedPassword,
        nickName,
        phone,
        street,
        city,
        state,
        pincode,
        region,
        otp
      },
      process.env.JWT_SECRET,
      { expiresIn: "10m" }
    );

    await sendEmail(
      sanitizedEmail,
      "Verify your Seller Account",
      `<p>Your OTP is <b>${otp}</b></p>`
    );

    res.json({
      success: true,
      message: "OTP sent to email",
      tempToken
    });

  } catch (error) {
    console.error("REGISTER ERROR:", error);
    res.status(500).json({ success: false, message: "Registration failed" });
  }
};


// ========================= LOGIN SELLER =========================
export const loginseller = async (req, res) => {
  try {
    const { email, password } = req.body;

    const sanitizedEmail = validator.normalizeEmail(email?.trim().toLowerCase());
    if (!sanitizedEmail || !password) {
      return res.json({ success: false, message: "Invalid credentials" });
    }

    const seller = await sellermodel.findOne({ email: sanitizedEmail });
    if (!seller) {
      return res.json({ success: false, message: "Invalid credentials" });
    }

    if (seller.isBlocked || seller.status === "Suspended") {
      return res.status(403).json({ success: false, message: "Account access denied" });
    }

    const match = await bcrypt.compare(password, seller.password);
    if (!match) {
      return res.json({ success: false, message: "Invalid credentials" });
    }

    seller.lastLogin = Date.now();
    await seller.save();

    const token = jwt.sign(
      { id: seller._id, role: "seller" },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.cookie("stoken", token, SELLER_COOKIE_OPTIONS);

    res.json({
      success: true,
      message: "Login successful",
      user: {
        id: seller._id,
        name: seller.name,
        email: seller.email,
        uniqueId: seller.uniqueId,
        region: seller.region
      }
    });

  } catch (error) {
    console.error("LOGIN ERROR:", error);
    res.status(500).json({ success: false, message: "Login failed" });
  }
};
// ========================= VERIFY OTP & CREATE SELLER =========================
export const verifyOtp = async (req, res) => {
  try {
    const { otp, tempToken } = req.body;

    if (!otp || !tempToken) {
      return res.status(400).json({
        success: false,
        message: "OTP or session token missing"
      });
    }

    let payload;
    try {
      payload = jwt.verify(tempToken, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: "OTP session expired"
      });
    }

    if (payload.otp !== otp) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP"
      });
    }

    // prevent duplicate seller creation
    const existingSeller = await sellermodel.findOne({ email: payload.email });
    if (existingSeller) {
      return res.status(409).json({
        success: false,
        message: "Seller already verified"
      });
    }

    // Password was already hashed in registerseller before putting in JWT
    const hashedPassword = payload.password;
    // 🔥 GENERATE UNIQUE SELLER ID
    const uniqueId = generateSellerUniqueId(
      payload.pincode,
      payload.nickName
    );
    const seller = await sellermodel.create({
      uniqueId, // ✅ ADD THIS
      name: payload.name,
      email: payload.email,
      password: hashedPassword,
      nickName: payload.nickName,
      phone: payload.phone,
      region: payload.region,
      verified: true,
      address: {
        street: payload.street,
        city: payload.city,
        state: payload.state,
        pincode: payload.pincode
      }
    });

    await sendEmail(
      seller.email,
      "Seller Account Verified 🎉",
      `
    <h2>Welcome to GNG!</h2>
    <p>Your seller account has been verified successfully.</p>
    <p><b>Your Unique Seller ID:</b> ${seller.uniqueId}</p>
    <p>Please keep this ID for future reference.</p>
  `
    );

    const token = jwt.sign(
      { id: seller._id, role: "seller" },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.cookie("stoken", token, SELLER_COOKIE_OPTIONS);

    return res.json({
      success: true,
      message: "Account verified & Registration successfully....",
      user: {
        id: seller._id,
        name: seller.name,
        email: seller.email,
        uniqueId: seller.uniqueId,
        region: seller.region
      }
    });

  } catch (error) {
    console.error("VERIFY OTP ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "OTP verification failed"
    });
  }
};


export const isSellerAuthenticated = async (req, res) => {
  try {
    const seller = await sellermodel
      .findById(req.sellerId)
      .select("-password");

    if (!seller) {
      return res.status(401).json({ success: false });
    }

    res.json({
      success: true,
      seller: {
        id: seller._id,
        name: seller.name,
        email: seller.email,
        uniqueId: seller.uniqueId,
        verified: seller.verified,
        approved: seller.approved,
        status: seller.status
      }
    });
  } catch {
    res.status(401).json({ success: false });
  }
};




// ========================= LOGIN SELLER =========================

// export const loginseller = async (req, res) => {
//   try {
//     const { email, password } = req.body;

//     const seller = await sellermodel.findOne({ email });

//     if (!seller)
//       return res.json({ success: false, message: "Invalid credentials" });

//     if (!seller.verified)
//       return res.json({ success: false, message: "Please verify your email first" });

//     const match = await bcrypt.compare(password, seller.password);

//     if (!match)
//       return res.json({ success: false, message: "Invalid credentials" });

//     const token = jwt.sign({ id: seller._id }, process.env.JWT_SECRET);

//     res.json({
//       success: true,
//       token,
//       message: "Login successful",
//       user: {
//         name: seller.name,
//         email: seller.email,
//         nickName: seller.nickName,
//         id: seller._id
//       }
//     });

export const addproducts = async (req, res) => {
  try {
    console.log("Add Product Request Body:", req.body);
    console.log("Add Product Files:", req.files);
    const sellerId = req.sellerId;  // from token

    const {
      title, description, price, categoryname, subcategory,
      oldprice, discount, ingredients, brand, additional_details,
      size, stock,
      // ⭐ Extra Product Specification Fields
      productDimensions, itemWeight, itemDimensionsLxWxH, netQuantity,
      genericName, asin, itemPartNumber, dateFirstAvailable, bestSellerRank,
      materialComposition, outerMaterial, length, careInstructions, aboutThisItem,
      manufacturer, packer, department, countryOfOrigin,
      // ⭐ State & Occasion Fields
      state, occasions, giftFor,
      // ⭐ B2B Corporate Gifting Fields
      bulkPricing, customizationAvailable, logoMinQuantity,
      recipientTypes, perfectFor, contents, productType, deliveryDays,
      // ⭐ SEO & Compliance
      metaTitle, metaDescription, tags, hsnCode, gstRate, moq
    } = req.body;

    // Basic required field validation
    if (!title || !description || !price || !categoryname || !subcategory || !stock) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    // ========== PRICE & DISCOUNT VALIDATION ==========
    const numPrice = Number(price);
    const numOldPrice = Number(oldprice) || numPrice;
    const numDiscount = Number(discount) || 0;
    const numStock = Number(stock);

    // Validate price is positive
    if (isNaN(numPrice) || numPrice <= 0) {
      return res.status(400).json({ success: false, message: 'Price must be a positive number' });
    }

    // Maximum price limit (prevent typos like 100000000)
    if (numPrice > 10000000) {
      return res.status(400).json({ success: false, message: 'Price exceeds maximum allowed limit (₹1 Crore)' });
    }

    // Validate old price >= current price
    if (numOldPrice < numPrice) {
      return res.status(400).json({ success: false, message: 'Original price cannot be less than current price' });
    }

    // Validate discount range (0-99%)
    if (numDiscount < 0 || numDiscount > 99) {
      return res.status(400).json({ success: false, message: 'Discount must be between 0 and 99%' });
    }

    // Validate discount calculation matches (with 10% tolerance for rounding)
    if (numOldPrice > 0 && numDiscount > 0) {
      const expectedPrice = Math.round(numOldPrice * (1 - numDiscount / 100));
      const priceDifference = Math.abs(numPrice - expectedPrice);
      const tolerance = numOldPrice * 0.1; // 10% tolerance

      if (priceDifference > tolerance) {
        return res.status(400).json({
          success: false,
          message: `Price mismatch: With ${numDiscount}% discount on ₹${numOldPrice}, expected price ~₹${expectedPrice}`
        });
      }
    }

    // Validate stock is non-negative
    if (isNaN(numStock) || numStock < 0) {
      return res.status(400).json({ success: false, message: 'Stock must be a non-negative number' });
    }

    // Validate stock maximum
    if (numStock > 1000000) {
      return res.status(400).json({ success: false, message: 'Stock exceeds maximum allowed limit' });
    }

    // ========== IMAGE UPLOAD ==========
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one product image is required' });
    }

    const images = await Promise.all(
      req.files.map(file =>
        cloudinary.uploader.upload(file.path, { resource_type: "image" })
      )
    );

    const imageUrls = images.map(img => ({
      url: img.secure_url,
      altText: title,
    }));

    // ========== CREATE PRODUCT WITH VALIDATED VALUES ==========
    // Parse dynamic attributes from additional_details or attributes field
    let dynamicAttributes = {};
    try {
      if (req.body.additional_details) {
        const parsed = typeof req.body.additional_details === 'string'
          ? JSON.parse(req.body.additional_details)
          : req.body.additional_details;
        dynamicAttributes = { ...dynamicAttributes, ...parsed };
      }
      if (req.body.attributes) {
        const parsed = typeof req.body.attributes === 'string'
          ? JSON.parse(req.body.attributes)
          : req.body.attributes;
        dynamicAttributes = { ...dynamicAttributes, ...parsed };
      }
    } catch (parseError) {
      console.log("Dynamic attributes parse info:", parseError.message);
      // If parsing fails, treat additional_details as regular text
    }

    // Parse JSON fields if they come as strings
    const parseJSON = (field) => {
      if (!field) return undefined;
      if (typeof field === 'string') {
        try { return JSON.parse(field); } catch { return field; }
      }
      return field;
    };

    const newProduct = new addproductmodel({
      title: title.trim(),
      description: description.trim(),
      price: numPrice,           // Use validated number
      categoryname,
      subcategory,
      oldprice: numOldPrice,     // Use validated number
      discount: numDiscount,     // Use validated number
      ingredients,
      brand,
      additional_details: typeof req.body.additional_details === 'string' && !req.body.additional_details.startsWith('{')
        ? req.body.additional_details
        : undefined,
      size,
      stock: numStock,           // Use validated number
      sellerId,
      images: imageUrls,
      // ⭐ Dynamic Category Attributes
      attributes: dynamicAttributes,
      // ⭐ Add Extra Fields
      productDimensions, itemWeight, itemDimensionsLxWxH, netQuantity,
      genericName, gngId: req.body.gngId, itemPartNumber, dateFirstAvailable, bestSellerRank,
      materialComposition: dynamicAttributes.material || materialComposition,
      outerMaterial,
      length: dynamicAttributes.length || length,
      careInstructions: dynamicAttributes.care_instructions || careInstructions,
      aboutThisItem,
      manufacturer, packer, department, countryOfOrigin,

      // ⭐ State & Occasion Fields (For Regional Handicrafts)
      state: state || '',
      occasions: parseJSON(occasions) || [],
      giftFor: parseJSON(giftFor) || [],

      // ⭐ B2B Corporate Gifting Fields
      bulkPricing: parseJSON(bulkPricing),
      customizationAvailable: parseJSON(customizationAvailable),
      logoMinQuantity: Number(logoMinQuantity) || 25,
      recipientTypes: parseJSON(recipientTypes) || [],
      perfectFor: parseJSON(perfectFor) || [],
      contents: parseJSON(contents) || [],
      productType: productType || 'Single Item',
      deliveryDays: deliveryDays || '5-7 days',

      // ⭐ SEO & Compliance
      metaTitle,
      metaDescription,
      tags: parseJSON(tags) || [],
      hsnCode,
      gstRate: Number(gstRate) || 18,
      moq: Number(moq) || 1,

      // NOTE: Auto-approve is kept because no admin approval endpoint/UI exists yet.
      // Sprint 5 will add: admin approval endpoint → then flip this to false.
      approved: true,
      isAvailable: true
    });

    await newProduct.save();

    await sellermodel.findByIdAndUpdate(
      sellerId,
      {
        lastProductPostedAt: new Date(),
        inactiveSince: null,
        inactiveNotificationSentAt: null
      }
    );

    return res.status(201).json({ success: true, message: "Product added successfully" });

  } catch (err) {
    console.error("ADD PRODUCT ERROR:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const getSellerProfile = async (req, res) => {
  try {
    const sellerId = req.sellerId;   // ← FIXED

    const seller = await sellermodel.findById(sellerId);

    return res.status(200).json({ success: true, seller });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false });
  }
};

export const updateSellerProfile = async (req, res) => {
  try {
    const sellerId = req.sellerId;

    let seller = await sellermodel.findById(sellerId);
    if (!seller) return res.status(404).json({ success: false, message: "Seller not found" });

    // 1. Extract fields from req.body
    const { name, email, phone, alternatePhone, street, city, state, pincode, nickName, about, holidayMode } = req.body;

    // Update fields
    seller.name = name || seller.name;
    // Issue #21 fix: Email changes are NOT allowed via profile update
    // Email is a verified identity — changing it requires a separate re-verification flow
    if (email && email !== seller.email) {
      return res.status(400).json({
        success: false,
        message: "Email cannot be changed through profile update. Contact support."
      });
    }
    seller.phone = phone || seller.phone;
    seller.nickName = nickName || seller.nickName;
    seller.about = about || seller.about;

    // Handle boolean explicitly
    if (holidayMode !== undefined) {
      seller.holidayMode = holidayMode;
    }

    // 2. Update the specific field
    seller.alternatePhone = alternatePhone || seller.alternatePhone;

    seller.address = {
      street: street || seller.address?.street,
      city: city || seller.address?.city,
      state: state || seller.address?.state,
      pincode: pincode || seller.address?.pincode,
    };

    if (req.file) {
      const uploaded = await cloudinary.uploader.upload(req.file.path, {
        folder: "seller_profiles"
      });
      seller.image = uploaded.secure_url;
    }

    await seller.save();

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      seller,
    });

  } catch (e) {
    console.error(e);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const getSellerOrders = async (req, res) => {

  const sellerId = req.sellerId;

  try {

    const orders = await orderModel.find({
      items: { $elemMatch: { sellerId } }
    })
    .populate("user", "name email")
    .populate("items.productId", "title price brand images")
    .sort({ placedAt: -1 });


    if (!orders.length) {
      return res.status(200).json({
        success: true,
        filteredOrders: []
      });
    }


    const filteredOrders = orders.map(order => {

      const sellerItems = order.items.filter(
        item => item.sellerId.toString() === sellerId.toString()
      );


      const sellerStatus =
        sellerItems.length > 0
          ? sellerItems[0].status || order.status
          : order.status;


      return {

        _id: order._id,

        user: order.user,

        items: sellerItems.map(item => ({

          _id: item._id,

          productId: item.productId,

          name: item.name,

          quantity: item.quantity,

          price: item.price,

          status: item.status,

          // ✅ Gift Details
          giftMessage: item.giftMessage || "",

          senderName: item.senderName || "",

          receiverName: item.receiverName || ""

        })),

        totalAmount: sellerItems.reduce(
          (acc, item) => acc + item.price * item.quantity,
          0
        ),

        // ✅ FULL SHIPPING DETAILS
        shippingAddress: {

          name: order.shippingAddress?.name || "",

          address: order.shippingAddress?.address || "",

          city: order.shippingAddress?.city || "",

          state: order.shippingAddress?.state || "",

          pin: order.shippingAddress?.pin || "",

          phone: order.shippingAddress?.phone || "",

          alternatephone: order.shippingAddress?.alternatephone || ""

        },

        placedAt: order.placedAt,

        status: sellerStatus,

        paymentId: order.paymentId,

        image: order.image

      };

    });


    res.status(200).json({
      success: true,
      filteredOrders
    });


  } catch (error) {

    console.error("Error fetching seller orders:", error);

    res.status(500).json({
      success: false,
      message: "Server error"
    });

  }

};
export const getSeller = async (req, res) => {
  const sellerId = req.sellerId;
  // const { sellerId } = req.body

  const seller = await sellermodel.find({ _id: sellerId })

  if (!seller.length) {
    return res.status(404).json({ message: "seller not found" })

  }

  return res.status(200).json({ success: true, seller });

}
export const getSellerDashboardStats = async (req, res) => {
  try {
    // const { sellerId } = req.body;
    const sellerId = req.sellerId;
    // Get seller's products
    const products = await addproductmodel.find({ sellerId });

    // Get all orders where this seller's product exists
    const orders = await orderModel.find({ "items.sellerId": sellerId });

    let totalOrders = 0;
    let totalSales = 0;
    let totalRevenue = 0;

    orders.forEach(order => {
      // Only count items belonging to this seller
      const sellerItems = order.items.filter(item => item.sellerId?.toString() === sellerId.toString());

      if (sellerItems.length > 0) {
        totalOrders += 1; // Count unique orders containing seller's products

        // Sum up revenue from seller's items only
        const orderRevenue = sellerItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);
        totalSales += orderRevenue;
      }
    });

    totalRevenue = totalSales; // You can subtract expenses or fees here

    res.status(200).json({
      success: true,
      stats: {
        totalOrders,
        totalSales,
        totalRevenue,
        totalProducts: products.length
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to fetch dashboard stats' });
  }
};


// Update Order Status
// SECURITY: IDOR protected + Status validation
export const updateSellerOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    // SECURITY: Only use authenticated sellerId, never from body
    const sellerId = req.sellerId;

    if (!sellerId) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

    // SECURITY: Whitelist allowed status values to prevent injection
    const ALLOWED_STATUSES = ['Pending', 'Processing', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancelled'];
    if (!status || !ALLOWED_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Allowed values: ${ALLOWED_STATUSES.join(', ')}`
      });
    }

    // Issue #22 fix: Order status state machine — enforce valid transitions only
    const VALID_TRANSITIONS = {
      'Pending':          ['Processing', 'Cancelled'],
      'Confirmed':        ['Processing', 'Cancelled'],
      'Processing':       ['Shipped', 'Cancelled'],
      'Shipped':          ['Out for Delivery', 'Delivered'],
      'Out for Delivery': ['Delivered'],
      'Delivered':        [],  // Terminal state — no changes allowed
      'Cancelled':        [],  // Terminal state — no changes allowed
    };

    // SECURITY: IDOR Protection - Only find orders containing seller's items
    const order = await orderModel.findOne({
      _id: orderId,
      "items.sellerId": sellerId
    });

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found or access denied" });
    }

    // Check each seller item's current status allows the transition
    const sellerItems = order.items.filter(item => item.sellerId.toString() === sellerId.toString());
    for (const item of sellerItems) {
      const currentStatus = item.status || 'Pending';
      const allowed = VALID_TRANSITIONS[currentStatus] || [];
      if (!allowed.includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Cannot change status from "${currentStatus}" to "${status}". Allowed transitions: ${allowed.join(', ') || 'none (terminal state)'}`
        });
      }
    }

    // Only update status for this seller's items
    order.items.forEach((item) => {
      if (item.sellerId.toString() === sellerId.toString()) {
        item.status = status;
      }
    });

    // Update global status based on all items
    const allDelivered = order.items.every(item => item.status === 'Delivered');
    const allCancelled = order.items.every(item => item.status === 'Cancelled');

    if (allDelivered) {
      order.status = 'Delivered';
    } else if (allCancelled) {
      order.status = 'Cancelled';
    } else if (status !== 'Pending' && status !== 'Cancelled' && order.status === 'Pending') {
      order.status = 'Processing';
    }

    await order.save();

    // --- Dispatch Notification (Fire and Forget) ---
    (async () => {
      try {
        const buyer = await usermodel.findById(order.user).select('name email');
        if (buyer) {
          await notifyBuyerStatusChange({
            buyerEmail: buyer.email,
            buyerName: buyer.name,
            orderId: order._id,
            oldStatus: sellerItems[0].status, // Previous status before this request
            newStatus: status
          });
        }
      } catch (notifErr) {
        console.error("Failed to send status update notification:", notifErr);
      }
    })();

    return res.json({ success: true, message: "Order status updated", order });
  } catch (error) {
    console.error("Update status error:", error);
    res.status(500).json({ success: false, message: "Failed to update order status" });
  }
};

/**
 * Process Return
 * Sellers can approve or reject return requests for their items
 */
export const processReturn = async (req, res) => {
  try {
    const sellerId = req.sellerId;
    const { orderId } = req.params;
    const { action, itemId } = req.body; // action = "approve" or "reject"

    const order = await orderModel.findById(orderId);
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    // Ensure the item belongs to the seller and has a requested return
    let itemToProcess = null;
    
    if (itemId) {
      itemToProcess = order.items.find(
        item => item._id.toString() === itemId && item.sellerId.toString() === sellerId.toString()
      );
    } else {
      // Find the first item requested for return from this seller
      itemToProcess = order.items.find(
        item => item.sellerId.toString() === sellerId.toString() && item.returnStatus === "Requested"
      );
    }

    if (!itemToProcess) {
      return res.status(404).json({ success: false, message: "Return request not found for your items" });
    }

    if (itemToProcess.returnStatus !== "Requested") {
      return res.status(400).json({ success: false, message: `Return already ${itemToProcess.returnStatus}` });
    }

    if (action === "approve") {
      itemToProcess.returnStatus = "Approved";
      itemToProcess.status = "Returned";
      
      // Attempt refund
      if (order.paymentId && order.refundStatus !== "Processed") {
        const refundResult = await processFullRefund(order.paymentId);
        if (refundResult.success) {
          order.refundStatus = "Processed";
          order.refundId = refundResult.refundId;
        } else {
          console.error(`Refund failed for order ${order._id}:`, refundResult.error);
          order.refundStatus = "Failed";
        }
      }

      // Restore stock
      await restoreCancelledStock([{
        productId: itemToProcess.productId,
        quantity: itemToProcess.quantity
      }]);
      
      // Update global order status if all items are returned/cancelled
      const allReturnedOrCancelled = order.items.every(
        i => i.status === "Returned" || i.status === "Cancelled"
      );
      if (allReturnedOrCancelled) order.status = "Returned";

    } else if (action === "reject") {
      itemToProcess.returnStatus = "Rejected";
    } else {
      return res.status(400).json({ success: false, message: "Invalid action. Use 'approve' or 'reject'" });
    }

    await order.save();

    // Notify Buyer
    (async () => {
      try {
        const buyer = await usermodel.findById(order.user).select('name email');
        if (buyer) {
          await notifyBuyerStatusChange({
            buyerEmail: buyer.email,
            buyerName: buyer.name,
            orderId: order._id,
            oldStatus: "Delivered",
            newStatus: action === "approve" ? "Returned" : "Return Rejected"
          });
        }
      } catch (notifErr) {
        console.error("Failed to notify buyer of return decision:", notifErr);
      }
    })();

    res.json({ success: true, message: `Return ${action}d successfully`, order });
  } catch (error) {
    console.error("Process return error:", error);
    res.status(500).json({ success: false, message: "Failed to process return" });
  }
};

// --- NEW: Get Seller Earnings & Transactions ---
export const getSellerEarnings = async (req, res) => {
  try {

    const sellerId = req.sellerId;  // ✔ from token


    const orders = await orderModel.find({
      "items.sellerId": sellerId
    }).populate("user", "name email");

    let totalEarnings = 0;
    let pendingClearance = 0;
    const transactions = [];

    const completedStatuses = ["Delivered", "Completed"];
    const pendingStatuses = ["Pending", "Processing", "Shipped"];

    orders.forEach(order => {
      const sellerItems = order.items.filter(item => item.sellerId.toString() === sellerId.toString());
      const orderTotal = sellerItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);

      if (orderTotal > 0) {
        // Issue #61 fix: Only count Delivered/Completed as real earnings
        if (completedStatuses.includes(order.status)) {
          totalEarnings += orderTotal;
        } else if (pendingStatuses.includes(order.status)) {
          pendingClearance += orderTotal;
        }

        transactions.push({
          orderId: order._id,
          date: order.placedAt,
          customer: order.user?.name || order.shippingAddress?.name || "Guest",
          amount: orderTotal,
          status: order.status
        });
      }
    });

    transactions.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.status(200).json({
      success: true,
      data: {
        totalEarnings,
        pendingClearance,
        transactions
      }
    });
  } catch (error) {
    console.error("Earnings Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// --- NEW: Get My Customers ---
export const getSellerCustomers = async (req, res) => {
  try {
    const sellerId = req.sellerId;  // ✔ from token


    const orders = await orderModel.find({ "items.sellerId": sellerId })
      .populate("user", "name email");

    const uniqueCustomers = {};

    orders.forEach(order => {
      // Use shipping address if user relation is missing
      const customerId = order.user?._id?.toString() || order.shippingAddress?.phone;
      const customerName = order.user?.name || order.shippingAddress?.name || "Guest";
      const customerEmail = order.user?.email || "N/A";
      const customerPhone = order.shippingAddress?.phone || "N/A";

      if (customerId) {
        const orderValue = order.items
          .filter(item => item.sellerId.toString() === sellerId.toString())
          .reduce((acc, item) => acc + (item.price * item.quantity), 0);

        if (!uniqueCustomers[customerId]) {
          uniqueCustomers[customerId] = {
            _id: customerId,
            name: customerName,
            email: customerEmail,
            phone: customerPhone,
            totalOrders: 0,
            totalSpent: 0,
            lastOrderDate: order.placedAt
          };
        }

        uniqueCustomers[customerId].totalOrders += 1;
        uniqueCustomers[customerId].totalSpent += orderValue;
        if (new Date(order.placedAt) > new Date(uniqueCustomers[customerId].lastOrderDate)) {
          uniqueCustomers[customerId].lastOrderDate = order.placedAt;
        }
      }
    });

    res.status(200).json({ success: true, customers: Object.values(uniqueCustomers) });
  } catch (error) {
    console.error("Customer Fetch Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

export const getSellerNotifications = async (req, res) => {
  try {
    const sellerId = req.sellerId;
    const { status = "all" } = req.query;

    const filter = { sellerId };
    if (status === "unread") filter.isRead = false;
    if (status === "read") filter.isRead = true;

    const notifications = await SellerNotification.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    const unreadCount = notifications.filter((item) => !item.isRead).length;

    res.status(200).json({
      success: true,
      notifications,
      stats: {
        total: notifications.length,
        unread: unreadCount
      }
    });
  } catch (error) {
    console.error("Seller Notifications Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

export const markSellerNotificationRead = async (req, res) => {
  try {
    const sellerId = req.sellerId;
    const { id } = req.params;

    const notification = await SellerNotification.findOneAndUpdate(
      { _id: id, sellerId },
      { isRead: true, readAt: new Date() },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ success: false, message: "Notification not found" });
    }

    res.status(200).json({ success: true, notification });
  } catch (error) {
    console.error("Seller Notification Update Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ========================= RESEND VERIFICATION OTP =========================
export const resendVerificationOtp = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || typeof email !== 'string') {
      return res.json({ success: false, message: "Email is required" });
    }

    const sanitizedEmail = validator.normalizeEmail(email.trim().toLowerCase());
    const seller = await sellermodel.findOne({ email: sanitizedEmail });

    if (!seller) {
      return res.json({ success: false, message: "Seller not found" });
    }

    if (seller.verified) {
      return res.json({ success: false, message: "Account is already verified" });
    }

    // Rate limiting: Check if OTP was sent recently (1 minute cooldown)
    if (seller.otpExpire && seller.otpExpire > Date.now() - 60000) {
      const waitTime = Math.ceil((seller.otpExpire - Date.now() + 60000) / 1000);
      return res.json({
        success: false,
        message: `Please wait ${waitTime} seconds before requesting new OTP`
      });
    }

    const otp = crypto.randomInt(100000, 999999).toString();

    seller.otp = otp;
    seller.otpExpire = Date.now() + 10 * 60 * 1000; // 10 minutes
    await seller.save();

    await sendEmail(sanitizedEmail, "Your New OTP Verification Code", `
      <h1>Email Verification</h1>
      <p>Your new OTP is: <b>${otp}</b></p>
      <p>This code expires in 10 minutes.</p>
      <p>If you did not request this, please ignore this email.</p>
    `);

    res.json({ success: true, message: "New OTP sent to your email" });
  } catch (error) {
    console.error("Resend OTP Error:", error);
    res.status(500).json({ success: false, message: "Failed to send OTP. Please try again." });
  }
};

// ========================= FORGOT PASSWORD =========================
export const sellerForgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || typeof email !== 'string') {
      return res.json({ success: false, message: "Email is required" });
    }

    const sanitizedEmail = validator.normalizeEmail(email.trim().toLowerCase());
    const seller = await sellermodel.findOne({ email: sanitizedEmail });

    if (!seller) {
      // Inform user that the email is not registered
      return res.json({ success: false, message: "This email is not linked to any seller account" });
    }

    // Check if seller is blocked
    if (seller.isBlocked) {
      return res.status(403).json({
        success: false,
        message: "Your account has been blocked. Contact support."
      });
    }

    // Rate limiting: Check if reset OTP was sent recently (2 minute cooldown)
    if (seller.resetOtpExpire && seller.resetOtpExpire > Date.now() - 120000) {
      return res.json({
        success: false,
        message: "Please wait before requesting another reset OTP"
      });
    }

    const otp = crypto.randomInt(100000, 999999).toString();

    seller.resetOtp = otp;
    seller.resetOtpExpire = Date.now() + 15 * 60 * 1000; // 15 minutes
    await seller.save();

    await sendEmail(seller.email, "Password Reset OTP", `
      <h1>Reset Your Password</h1>
      <p>Your OTP to reset password is: <b>${otp}</b></p>
      <p>This code expires in 15 minutes.</p>
      <p>If you did not request this, please ignore this email and your password will remain unchanged.</p>
    `);

    res.json({ success: true, message: "Password reset OTP sent to your email" });
  } catch (error) {
    console.error("Forgot Password Error:", error);
    res.status(500).json({ success: false, message: "Failed to send reset OTP. Please try again." });
  }
};

// ========================= RESET PASSWORD =========================
export const sellerResetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    // Validate inputs
    if (!email || !otp || !newPassword) {
      return res.json({ success: false, message: "Email, OTP, and new password are required" });
    }

    if (typeof email !== 'string' || typeof otp !== 'string' || typeof newPassword !== 'string') {
      return res.json({ success: false, message: "Invalid input format" });
    }

    // Validate password strength
    if (newPassword.length < 8) {
      return res.json({ success: false, message: "Password must be at least 8 characters" });
    }

    const sanitizedEmail = validator.normalizeEmail(email.trim().toLowerCase());
    const seller = await sellermodel.findOne({ email: sanitizedEmail });

    if (!seller) {
      return res.json({ success: false, message: "Invalid request" });
    }

    // Check if seller is blocked
    if (seller.isBlocked) {
      return res.status(403).json({
        success: false,
        message: "Your account has been blocked. Contact support."
      });
    }

    // Validate OTP
    if (!seller.resetOtp || seller.resetOtp !== otp) {
      return res.json({ success: false, message: "Invalid OTP" });
    }

    // Check OTP expiry
    if (!seller.resetOtpExpire || seller.resetOtpExpire < Date.now()) {
      return res.json({ success: false, message: "OTP has expired. Please request a new one." });
    }

    // Hash new password and save
    seller.password = await bcrypt.hash(newPassword, 10);
    seller.resetOtp = null;
    seller.resetOtpExpire = null;
    seller.lastLogin = Date.now();
    await seller.save();

    // Send confirmation email
    await sendEmail(seller.email, "Password Reset Successful", `
      <h1>Password Changed</h1>
      <p>Your password has been successfully reset.</p>
      <p>If you did not make this change, please contact support immediately.</p>
    `);

    // Auto-login: Create JWT token and set cookie
    const token = jwt.sign({ id: seller._id, role: 'seller' }, process.env.JWT_SECRET, { expiresIn: "7d" });

    res.cookie("stoken", token, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: "/"
    });

    res.json({
      success: true,
      message: "Password reset successfully. You are now logged in.",
      autoLogin: true,
      user: {
        name: seller.name,
        email: seller.email,
        id: seller._id,
        uniqueId: seller.uniqueId,
        region: seller.region
      }
    });
  } catch (error) {
    console.error("Reset Password Error:", error);
    res.status(500).json({ success: false, message: "Failed to reset password. Please try again." });
  }
};

// ========================= CHECK SELLER AUTHENTICATED =========================
// export const isSellerAuthenticated = async (req, res) => {
//   try {
//     const sellerId = req.sellerId;
//     const seller = await sellermodel.findById(sellerId).select('-password -otp -resetOtp');

//     if (!seller) {
//       return res.json({ success: false, message: "Seller not found" });
//     }

//     return res.json({
//       success: true,
//       seller: {
//         id: seller._id,
//         name: seller.name,
//         email: seller.email,
//         nickName: seller.nickName,
//         uniqueId: seller.uniqueId,
//         verified: seller.verified,
//         approved: seller.approved,
//         status: seller.status
//       }
//     });
//   } catch (error) {
//     console.error("Auth Check Error:", error);
//     res.status(500).json({ success: false, message: "Authentication check failed" });
//   }
// };

// ========================= LOGOUT SELLER =========================
export const logoutSeller = async (req, res) => {
  try {
    // Blacklist the current token so it can't be reused (Issue #7 fix)
    const token = req.cookies?.stoken;
    if (token) {
      const { blacklistToken } = await import("../utils/tokenBlacklist.js");
      blacklistToken(token, 'seller_logout');
    }

    // Clear the seller token cookie
    res.clearCookie("stoken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      path: "/"
    });

    res.json({ success: true, message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout Error:", error);
    res.status(500).json({ success: false, message: "Logout failed" });
  }
};