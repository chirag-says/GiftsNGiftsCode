import addproductmodel from "../model/addproduct.js";
import mongoose from "mongoose";
import Review from "../model/review.js";
import orderModel from "../model/order.js";
import { ProductAnalytics } from "../model/reportsModel.js";

export const addProduct = async (req, res) => {
  try {
    const sellerId = req.sellerId;
    if (!sellerId) {
      return res.status(400).json({ success: false, message: "Seller auth failed" });
    }

    const {
      title, description, categoryname, subcategory,
      price, oldprice, discount, ingredients, brand, size,
      additional_details,

      // ▶ New specification fields
      productDimensions, itemWeight, itemDimensionsLxWxH,
      netQuantity, genericName, asin, itemPartNumber,
      dateFirstAvailable, manufacturer, packer, department,
      countryOfOrigin, bestSellerRank,
      materialComposition, outerMaterial, length, careInstructions,
      aboutThisItem,

      // ▶ State & Occasion fields
      state, occasions, giftFor,

      // ▶ B2B Corporate Gifting Fields
      bulkPricing,           // { tier25, tier50, tier100, tier500 }
      customizationAvailable, // { logo, message, packaging }
      logoMinQuantity,
      recipientTypes,        // ['Employees', 'Clients', etc.]
      perfectFor,            // ['VIP Clients', 'Large Teams', etc.]
      contents,              // For hampers/gift boxes
      productType,           // 'Hamper', 'Single Item', 'Gift Set', etc.
      deliveryDays,          // '5-7 days'

      // ▶ SEO fields
      metaTitle,
      metaDescription,
      tags,

      // ▶ HSN & Compliance
      hsnCode,
      gstRate,
      moq,

      stock
    } = req.body;

    const imageArray = req.files?.images?.map(file => ({
      url: file.path,
      altText: title
    })) || [];

    // Parse JSON fields if they come as strings
    const parseJSON = (field) => {
      if (!field) return undefined;
      if (typeof field === 'string') {
        try { return JSON.parse(field); } catch { return field; }
      }
      return field;
    };

    const newProduct = new addproductmodel({
      title, description, categoryname, subcategory,
      price, oldprice, discount, ingredients, brand, size,
      additional_details,

      productDimensions, itemWeight, itemDimensionsLxWxH,
      netQuantity, genericName, asin, itemPartNumber,
      dateFirstAvailable, manufacturer, packer, department,
      countryOfOrigin, bestSellerRank,
      materialComposition, outerMaterial, length, careInstructions,
      aboutThisItem,

      state,
      occasions: parseJSON(occasions) || [],
      giftFor: parseJSON(giftFor) || [],

      // B2B Fields
      bulkPricing: parseJSON(bulkPricing),
      customizationAvailable: parseJSON(customizationAvailable),
      logoMinQuantity: Number(logoMinQuantity) || 25,
      recipientTypes: parseJSON(recipientTypes) || [],
      perfectFor: parseJSON(perfectFor) || [],
      contents: parseJSON(contents) || [],
      productType: productType || 'Single Item',
      deliveryDays: deliveryDays || '5-7 days',

      // SEO
      metaTitle,
      metaDescription,
      tags: parseJSON(tags) || [],

      // Compliance
      hsnCode,
      gstRate: Number(gstRate) || 18,
      moq: Number(moq) || 1,

      images: imageArray,
      sellerId,
      stock: Number(stock),

      // NOTE: Auto-approve is kept because no admin approval endpoint/UI exists yet.
      // Sprint 5 will add: admin approval endpoint → then flip this to false.
      // Changing to false now would make ALL new products invisible with no way to approve.
      approved: true,
      isAvailable: true
    });

    await newProduct.save();

    return res.status(201).json({ success: true, data: newProduct });

  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};


// 2. UPDATE PRODUCT (Handles Stock Updates)
// SECURITY: IDOR Protection + Mass Assignment Prevention
export const updateProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    const sellerId = req.sellerId;

    // SECURITY: IDOR Protection - Verify product ownership
    // Must include sellerId in query to prevent unauthorized access
    const product = await addproductmodel.findOne({
      _id: productId,
      sellerId: sellerId  // CRITICAL: Only allow owner to update
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found or you don't have permission to edit it"
      });
    }

    // SECURITY: Mass Assignment Prevention
    // ONLY allow specific fields to be updated - explicit whitelist
    const ALLOWED_UPDATE_FIELDS = [
      'title', 'description', 'price', 'oldprice', 'discount',
      'stock', 'brand', 'size', 'ingredients', 'additional_details',
      'categoryname', 'subcategory',
      // Product specifications
      'productDimensions', 'itemWeight', 'itemDimensionsLxWxH',
      'netQuantity', 'genericName', 'asin', 'itemPartNumber',
      'dateFirstAvailable', 'manufacturer', 'packer', 'department',
      'countryOfOrigin', 'bestSellerRank', 'materialComposition',
      'outerMaterial', 'length', 'careInstructions', 'aboutThisItem',
      // State & Occasion fields
      'state', 'occasions', 'giftFor',
      // B2B Corporate Gifting fields
      'bulkPricing', 'customizationAvailable', 'logoMinQuantity',
      'recipientTypes', 'perfectFor', 'contents', 'productType',
      'deliveryDays', 'metaTitle', 'metaDescription', 'tags',
      // Compliance
      'hsnCode', 'gstRate', 'moq'
    ];

    // BLOCKED FIELDS - These should NEVER be updatable via this endpoint:
    // sellerId, _id, createdAt, approved, isFeatured, views

    // Apply only whitelisted fields
    ALLOWED_UPDATE_FIELDS.forEach(field => {
      if (req.body[field] !== undefined) {
        product[field] = req.body[field];
      }
    });

    // Recalculate availability if stock changes
    if (req.body.stock !== undefined) {
      const stock = parseInt(req.body.stock);
      if (isNaN(stock) || stock < 0) {
        return res.status(400).json({
          success: false,
          message: "Stock must be a non-negative number"
        });
      }
      product.stock = stock;
      product.isAvailable = stock > 0;

      if (stock <= 0) {
        product.availability = "Out of Stock";
      } else if (stock < 5) {
        product.availability = "Low Stock";
      } else {
        product.availability = "In Stock";
      }
    }

    // Handle image update if sent
    if (req.files?.images) {
      const newImages = req.files.images.map(file => ({
        url: file.path,
        altText: product.title
      }));
      product.images.push(...newImages);
    }

    await product.save();

    return res.status(200).json({ success: true, data: product });

  } catch (error) {
    console.error("Update Product Error:", error);
    return res.status(500).json({ success: false, message: "Failed to update product" });
  }
};

// ... (Include your delete, get, filter functions here as before)

export const getAllProducts = async (req, res) => {
  try {
    const sellerId = req.sellerId;

    const products = await addproductmodel.find({ sellerId });
    if (!products) {
      return res.status(404).json("no product found")
    }
    return res.status(200).json({ success: true, data: products });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};
export const getProductById = async (req, res) => {
  try {
    const { id } = req.params;

    const product = await addproductmodel.findById(id)
      .populate("categoryname", "name")
      .populate("subcategory", "name")
      .lean();

    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    // TRACK VIEW
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      await ProductAnalytics.findOneAndUpdate(
        { productId: id, date: today },
        { $inc: { views: 1 } },
        { upsert: true, new: true }
      );
    } catch (analyticsError) {
      console.error("Failed to track product view:", analyticsError);
      // Don't fail the request if analytics fails
    }

    // FETCH TOTAL VIEWS
    let totalViews = 0;
    try {
      const analytics = await ProductAnalytics.aggregate([
        { $match: { productId: new mongoose.Types.ObjectId(id) } },
        { $group: { _id: null, totalViews: { $sum: "$views" } } }
      ]);
      if (analytics.length > 0) {
        totalViews = analytics[0].totalViews;
      }
    } catch (err) {
      console.error("Error fetching total views", err);
    }

    return res.status(200).json({ success: true, data: { ...product, views: totalViews } });

  } catch (error) {
    return res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};


// export const filterProducts = async (req, res) => {
//   try {//
//     const { categoryname, minPrice, maxPrice, sort, discount } = req.query;
//     const filter = {};

//     if (categoryname) filter.categoryname = categoryname;
//     if (minPrice || maxPrice) {
//       filter.price = {};
//       if (minPrice) filter.price.$gte = parseFloat(minPrice);
//       if (maxPrice) filter.price.$lte = parseFloat(maxPrice);
//     }
//     if (discount) filter.discount = { $gte: parseFloat(discount) };

//     let sortOption = {};
//     if (sort === 'asc') sortOption.price = 1;
//     if (sort === 'desc') sortOption.price = -1;

//     const products = await addproductmodel.find(filter).sort(sortOption);
//     res.status(200).json({ success: true, data: products });
//   } catch (error) {
//     res.status(500).json({ success: false, message: "Server error", error: error.message });
//   }
// };
export const filterProducts = async (req, res) => {
  try {
    const { categoryname, minPrice, maxPrice, sort, discount } = req.query;
    const filter = {};

    // Handle category filter
    if (categoryname) {
      const categoriesArray = categoryname.split(',');
      filter.categoryname = { $in: categoriesArray.map(id => new mongoose.Types.ObjectId(id)) };
    }

    // Handle price filter
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = parseFloat(minPrice);
      if (maxPrice) filter.price.$lte = parseFloat(maxPrice);
    }

    // Handle discount
    if (discount) {
      filter.discount = { $gte: parseFloat(discount) };
    }

    // Sorting
    let sortOption = {};
    if (sort === 'asc') sortOption.price = 1;
    if (sort === 'desc') sortOption.price = -1;

    // Fetch and return
    const products = await addproductmodel.find(filter).sort(sortOption);
    res.status(200).json({ success: true, data: products });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};


/**
 * Delete Product
 * SECURITY: IDOR Protection - Sellers can only delete their own products
 */
export const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const sellerId = req.sellerId;

    // SECURITY: Verify product ownership before deletion
    // findOneAndDelete atomically checks ownership and deletes
    const deletedProduct = await addproductmodel.findOneAndDelete({
      _id: id,
      sellerId: sellerId  // CRITICAL: Only allow owner to delete
    });

    if (!deletedProduct) {
      return res.status(404).json({
        success: false,
        message: "Product not found or you don't have permission to delete it"
      });
    }

    res.json({
      success: true,
      message: "Product deleted successfully",
      deletedId: deletedProduct._id
    });
  } catch (error) {
    console.error("Delete Product Error:", error);
    res.status(500).json({ success: false, message: 'Failed to delete product' });
  }
};

// export const updateProduct = async (req, res) => {
//   try {
//     const updated = await addproductmodel.findByIdAndUpdate(
//       req.params.id,
//       { $set: req.body },
//       { new: true, runValidators: true }
//     );

//     await updated.save(); // triggers pre-save hook

//     res.status(200).json({ success: true, data: updated });
//   } catch (error) {
//     res.status(500).json({ success: false, message: error.message });
//   }
// };

export const createReview = async (req, res) => {
  try {
    const { productId, rating, comment, userName, title } = req.body;
    const userId = req.userId; // SECURITY: from auth middleware, not req.body (Issue #69)

    if (!productId || !rating || !userName) {
      return res.status(400).json({ success: false, error: "Missing required fields: productId, rating, and userName are required" });
    }

    // Validate rating is between 1-5
    if (rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, error: "Rating must be between 1 and 5" });
    }

    // Check if product exists
    const product = await addproductmodel.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, error: "Product not found" });
    }

    // Check if user has already reviewed this product (if userId provided)
    if (userId) {
      const existingReview = await Review.findOne({ productId, userId });
      if (existingReview) {
        return res.status(400).json({
          success: false,
          error: "You have already reviewed this product",
          existingReviewId: existingReview._id
        });
      }
    }

    // Issue #29 fix: Enforce purchase verification — only buyers who received the product can review
    let isVerifiedPurchase = false;
    let verifiedOrderId = null;

    if (userId) {
      const deliveredOrder = await orderModel.findOne({
        user: userId,
        'items.productId': productId,
        status: { $in: ['Delivered', 'Completed'] }
      });

      if (deliveredOrder) {
        isVerifiedPurchase = true;
        verifiedOrderId = deliveredOrder._id;
      } else {
        return res.status(403).json({
          success: false,
          error: "You can only review products you have purchased and received"
        });
      }
    }

    const newReview = new Review({
      productId,
      userId: userId || null,
      rating,
      comment: comment || '',
      title: title || '',
      userName,
      isVerifiedPurchase,
      orderId: verifiedOrderId,
      status: 'Approved' // Auto-approve for now
    });

    const savedReview = await newReview.save();

    res.status(201).json({
      success: true,
      data: savedReview,
      isVerifiedPurchase,
      message: isVerifiedPurchase
        ? "Review submitted with Verified Purchase badge!"
        : "Review submitted successfully!"
    });
  } catch (error) {
    console.error("Create Review Error:", error);
    res.status(500).json({ success: false, error: "Failed to create review" });
  }
};

// GET: Get all reviews for a product with stats
export const getProductReviews = async (req, res) => {
  try {
    const { id } = req.params;
    const reviews = await Review.find({ productId: id, status: 'Approved' })
      .sort({ isVerifiedPurchase: -1, createdAt: -1 }); // Verified purchases first

    // Calculate stats
    const totalReviews = reviews.length;
    const avgRating = totalReviews > 0
      ? reviews.reduce((acc, r) => acc + r.rating, 0) / totalReviews
      : 0;

    const ratingBreakdown = {
      5: reviews.filter(r => r.rating === 5).length,
      4: reviews.filter(r => r.rating === 4).length,
      3: reviews.filter(r => r.rating === 3).length,
      2: reviews.filter(r => r.rating === 2).length,
      1: reviews.filter(r => r.rating === 1).length
    };

    const verifiedCount = reviews.filter(r => r.isVerifiedPurchase).length;

    res.json({
      success: true,
      reviews,
      stats: {
        totalReviews,
        avgRating: parseFloat(avgRating.toFixed(1)),
        ratingBreakdown,
        verifiedPurchases: verifiedCount
      }
    });
  } catch (error) {
    console.error("Get Reviews Error:", error);
    res.status(500).json({ success: false, error: "Error fetching reviews" });
  }
};

// Check if user can review a product (has purchased and not already reviewed)
export const canUserReview = async (req, res) => {
  try {
    const { productId } = req.query;
    const userId = req.userId; // SECURITY: from auth middleware (Issue #54)

    if (!productId) {
      return res.status(400).json({ success: false, canReview: false, reason: "Product ID required" });
    }

    if (!userId) {
      // Auth middleware should always set this, but defensive check
      return res.json({
        success: true,
        canReview: true,
        isVerifiedPurchase: false,
        reason: "Login to leave a verified review"
      });
    }

    // Check if already reviewed
    const existingReview = await Review.findOne({ productId, userId });
    if (existingReview) {
      return res.json({
        success: true,
        canReview: false,
        reason: "You have already reviewed this product",
        existingReview: {
          _id: existingReview._id,
          rating: existingReview.rating,
          comment: existingReview.comment,
          createdAt: existingReview.createdAt
        }
      });
    }

    // Check if user has purchased this product
    const hasPurchased = await orderModel.findOne({
      user: userId,
      'items.productId': productId,
      status: { $in: ['Delivered', 'Completed'] }
    });

    if (hasPurchased) {
      return res.json({
        success: true,
        canReview: true,
        isVerifiedPurchase: true,
        reason: "You can review this product with a Verified Purchase badge!"
      });
    }

    // User hasn't purchased but can still review
    return res.json({
      success: true,
      canReview: true,
      isVerifiedPurchase: false,
      reason: "You can review this product (not a verified purchase)"
    });

  } catch (error) {
    console.error("Can User Review Error:", error);
    res.status(500).json({ success: false, canReview: false, reason: "Server error" });
  }
};

// Get related products
export const getRelatedProducts = async (req, res) => {
  try {
    const product = await addproductmodel.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    const related = await addproductmodel.find({
      _id: { $ne: product._id },
      $or: [
        { categoryname: product.categoryname },
        { subcategory: product.subcategory },
      ],
    }).limit(6);

    res.status(200).json({ success: true, data: related });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

/**
 * Get Homepage Collections (Public API)
 * Returns products marked for "Best of North East" and "Under ₹999" sections
 */
export const getHomePageCollections = async (req, res) => {
  try {
    // Get "Best of North East" products (admin-curated)
    const bestOfNorthEast = await addproductmodel.find({
      showInBestOfNorthEast: true,
      approved: true,
      isAvailable: true
    })
      .select('title price oldprice discount images rating reviewCount state')
      .limit(8)
      .lean();

    // Get "Perfect Gifts Under ₹999" products (admin-curated)
    const under999 = await addproductmodel.find({
      showInUnder999: true,
      approved: true,
      isAvailable: true
    })
      .select('title price oldprice discount images rating reviewCount state')
      .limit()
      .lean();

    res.status(200).json({
      success: true,
      data: {
        bestOfNorthEast,
        under999
      }
    });
  } catch (error) {
    console.error("Homepage Collections Error:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};
