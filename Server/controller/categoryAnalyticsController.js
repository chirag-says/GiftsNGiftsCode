import addproductmodel from "../model/addproduct.js";
import Category from "../model/Category.js";
import Subcategory from "../model/Subcategory.js";
import orderModel from "../model/order.js";
import Review from "../model/review.js";
import { v2 as cloudinary } from "cloudinary";
import sellermodel from "../model/sellermodel.js";
import fs from "fs";
import { escapeRegex } from "../utils/errorHandler.js";

// Get My Categories (Categories seller has products in)
export const getMyCategories = async (req, res) => {
  try {
    const sellerId = req.sellerId; // SECURITY: IDOR fix — never trust req.body.sellerId

    // Populate categoryname to access images
    const products = await addproductmodel.find({ sellerId })
      .populate("categoryname", "categoryname images");

    // Get all orders for this seller
    const orders = await orderModel.find({ "items.sellerId": sellerId });

    const categoryMap = {};
    products.forEach(product => {
      if (product.categoryname) {
        const catId = product.categoryname._id.toString();
        if (!categoryMap[catId]) {
          // FIX: Extract the first image URL safely
          const imgUrl = product.categoryname.images && product.categoryname.images.length > 0
            ? product.categoryname.images[0].url
            : "";

          categoryMap[catId] = {
            _id: catId,
            name: product.categoryname.categoryname,
            image: imgUrl, // Send as a simple string to the client
            productCount: 0,
            totalStock: 0,
            avgPrice: 0,
            revenue: 0,
            salesCount: 0,
            products: []
          };
        }
        categoryMap[catId].productCount++;
        categoryMap[catId].totalStock += product.stock;
        categoryMap[catId].products.push({
          _id: product._id,
          title: product.title,
          price: product.price,
          stock: product.stock
        });
      }
    });

    // Calculate revenue and sales from orders
    orders.forEach(order => {
      order.items.forEach(item => {
        if (item.sellerId?.toString() === sellerId?.toString()) {
          const product = products.find(p => p._id.toString() === item.productId?.toString());
          if (product && product.categoryname) {
            const catId = product.categoryname._id.toString();
            if (categoryMap[catId]) {
              categoryMap[catId].revenue += item.price * item.quantity;
              categoryMap[catId].salesCount += item.quantity;
            }
          }
        }
      });
    });

    // Calculate average price
    Object.values(categoryMap).forEach(cat => {
      const totalPrice = cat.products.reduce((acc, p) => acc + p.price, 0);
      cat.avgPrice = cat.productCount > 0 ? (totalPrice / cat.productCount).toFixed(2) : 0;
    });

    res.status(200).json({
      success: true,
      data: {
        categories: Object.values(categoryMap),
        totalCategories: Object.keys(categoryMap).length,
        totalProducts: products.length
      }
    });
  } catch (error) {
    console.error("My Categories Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Get Category Performance
export const getCategoryPerformance = async (req, res) => {
  try {
    const sellerId = req.sellerId; // SECURITY: IDOR fix — never trust req.body.sellerId
    const { period = "30" } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period));

    const products = await addproductmodel.find({ sellerId })
      .populate("categoryname", "categoryname");

    const orders = await orderModel.find({
      "items.sellerId": sellerId,
      placedAt: { $gte: startDate }
    });

    const reviews = await Review.find({
      productId: { $in: products.map(p => p._id) }
    });

    const categoryPerformance = {};

    products.forEach(product => {
      const catName = product.categoryname?.categoryname || "Uncategorized";
      const catId = product.categoryname?._id?.toString() || "uncategorized";

      if (!categoryPerformance[catId]) {
        categoryPerformance[catId] = {
          _id: catId,
          name: catName,
          products: 0,
          orders: 0,
          revenue: 0,
          units: 0,
          reviews: 0,
          avgRating: 0,
          ratings: []
        };
      }
      categoryPerformance[catId].products++;
    });

    orders.forEach(order => {
      order.items.forEach(item => {
        if (item.sellerId.toString() === sellerId.toString()) {
          const product = products.find(p => p._id.toString() === item.productId?.toString());
          if (product) {
            const catId = product.categoryname?._id?.toString() || "uncategorized";
            if (categoryPerformance[catId]) {
              categoryPerformance[catId].orders++;
              categoryPerformance[catId].revenue += item.price * item.quantity;
              categoryPerformance[catId].units += item.quantity;
            }
          }
        }
      });
    });

    reviews.forEach(review => {
      const product = products.find(p => p._id.toString() === review.productId?.toString());
      if (product) {
        const catId = product.categoryname?._id?.toString() || "uncategorized";
        if (categoryPerformance[catId]) {
          categoryPerformance[catId].reviews++;
          categoryPerformance[catId].ratings.push(review.rating);
        }
      }
    });

    // Calculate average ratings
    Object.values(categoryPerformance).forEach(cat => {
      if (cat.ratings.length > 0) {
        cat.avgRating = (cat.ratings.reduce((a, b) => a + b, 0) / cat.ratings.length).toFixed(1);
      }
      delete cat.ratings;
    });

    res.status(200).json({
      success: true,
      data: {
        categories: Object.values(categoryPerformance).sort((a, b) => b.revenue - a.revenue),
        period: parseInt(period)
      }
    });
  } catch (error) {
    console.error("Category Performance Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Get Category Suggestions
export const getCategorySuggestions = async (req, res) => {
  try {
    const sellerId = req.sellerId; // SECURITY: IDOR fix — never trust req.body.sellerId

    // Get all categories
    const allCategories = await Category.find();

    // Get seller's current categories
    const products = await addproductmodel.find({ sellerId })
      .populate("categoryname", "categoryname");

    const sellerCategoryIds = new Set(
      products.map(p => p.categoryname?._id?.toString()).filter(Boolean)
    );

    // Find categories seller doesn't have products in
    const suggestedCategories = allCategories
      .filter(cat => !sellerCategoryIds.has(cat._id.toString()))
      .map(cat => ({
        _id: cat._id,
        name: cat.categoryname,
        images: cat.images, // FIX: Pass the full images array
        reason: "Expand your product range"
      }));

    // Get trending categories (based on overall order volume)
    const orders = await orderModel.find().populate("items.productId", "categoryname");
    const categoryOrderCount = {};

    orders.forEach(order => {
      order.items.forEach(item => {
        if (item.productId?.categoryname) {
          const catId = item.productId.categoryname.toString();
          categoryOrderCount[catId] = (categoryOrderCount[catId] || 0) + 1;
        }
      });
    });

    const trendingCategories = suggestedCategories
      .map(cat => ({
        ...cat,
        orderVolume: categoryOrderCount[cat._id.toString()] || 0,
        reason: categoryOrderCount[cat._id.toString()] > 10 ? "High demand category" : "Potential growth area"
      }))
      .sort((a, b) => b.orderVolume - a.orderVolume)
      .slice(0, 10);

    res.status(200).json({
      success: true,
      data: {
        suggestions: trendingCategories,
        currentCategories: sellerCategoryIds.size,
        totalAvailable: allCategories.length
      }
    });
  } catch (error) {
    console.error("Category Suggestions Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

/**
 * Add Category (Seller Version)
 * 
 * Allows approved sellers to add categories.
 * This is separate from the admin version and uses seller authentication.
 */
export const addSellerCategory = async (req, res) => {
  try {
    const sellerId = req.sellerId;
    const { categoryname, altText } = req.body;

    if (!sellerId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required"
      });
    }

    // Check if seller is approved
    const seller = await sellermodel.findById(sellerId);
    if (!seller || !seller.approved) {
      return res.status(403).json({
        success: false,
        message: "Only approved sellers can add categories"
      });
    }

    // Validate inputs
    if (!categoryname || !categoryname.trim()) {
      return res.status(400).json({
        success: false,
        message: "Category name is required"
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Category image is required"
      });
    }

    // Check if category already exists
    const safeCategoryName = escapeRegex(categoryname.trim());
    const existingCategory = await Category.findOne({
      categoryname: { $regex: new RegExp(`^${safeCategoryName}$`, 'i') }
    });

    if (existingCategory) {
      // Clean up uploaded file
      if (req.file?.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({
        success: false,
        message: "Category already exists"
      });
    }

    // Upload to Cloudinary
    const uploadResult = await cloudinary.uploader.upload(req.file.path, {
      folder: "categories",
      resource_type: "image"
    });

    // Create new category
    const newCategory = new Category({
      categoryname: categoryname.trim(),
      images: [{
        url: uploadResult.secure_url,
        altText: altText || categoryname.trim()
      }],
      createdBySeller: sellerId // Track who created it
    });

    await newCategory.save();

    // Clean up local temp file
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(200).json({
      success: true,
      message: "Category added successfully",
      category: newCategory
    });


  } catch (error) {
    console.error("Add Seller Category Error:", error);
    // Clean up on error
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({
      success: false,
      message: "Failed to add category"
    });
  }
};

/**
 * Add Subcategory (Seller Version)
 * 
 * Allows approved sellers to add subcategories.
 * This is separate from the admin version and uses seller authentication.
 */
export const addSellerSubcategory = async (req, res) => {
  try {
    const sellerId = req.sellerId;
    const { subcategory, categoryId } = req.body;

    if (!sellerId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required"
      });
    }

    // Check if seller is approved
    const seller = await sellermodel.findById(sellerId);
    if (!seller || !seller.approved) {
      return res.status(403).json({
        success: false,
        message: "Only approved sellers can add subcategories"
      });
    }

    // Validate inputs
    if (!subcategory || !subcategory.trim()) {
      return res.status(400).json({
        success: false,
        message: "Subcategory name is required"
      });
    }

    if (!categoryId) {
      return res.status(400).json({
        success: false,
        message: "Category ID is required"
      });
    }

    // Check if category exists
    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found"
      });
    }

    // Check if subcategory already exists
    const safeSubcategoryName = escapeRegex(subcategory.trim());
    const existingSubcategory = await Subcategory.findOne({
      subcategory: { $regex: new RegExp(`^${safeSubcategoryName}$`, 'i') },
      category: categoryId
    });

    if (existingSubcategory) {
      return res.status(400).json({
        success: false,
        message: "Subcategory already exists in this category"
      });
    }

    // Create new subcategory
    const newSubcategory = new Subcategory({
      subcategory: subcategory.trim(),
      category: categoryId,
      createdBySeller: sellerId // Track who created it
    });

    await newSubcategory.save();

    res.status(201).json({
      success: true,
      message: "Subcategory added successfully",
      subcategory: newSubcategory
    });

  } catch (error) {
    console.error("Add Seller Subcategory Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to add subcategory"
    });
  }
};
