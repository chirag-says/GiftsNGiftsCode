import Review from "../model/review.js";
import addproductmodel from "../model/addproduct.js";
import orderModel from "../model/order.js";

// Get Product Reviews (All products with their review stats)
export const getProductReviews = async (req, res) => {
  try {
    const sellerId = req.sellerId; // SECURITY: IDOR fix — never trust req.body.sellerId
    const { sort = "reviews" } = req.query;

    const products = await addproductmodel.find({ sellerId });
    
    const productReviewData = await Promise.all(products.map(async (product) => {
      const reviews = await Review.find({ productId: product._id }).sort({ createdAt: -1 });
      
      const avgRating = reviews.length > 0 
        ? reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length 
        : 0;

      const ratingBreakdown = {
        5: reviews.filter(r => r.rating === 5).length,
        4: reviews.filter(r => r.rating === 4).length,
        3: reviews.filter(r => r.rating === 3).length,
        2: reviews.filter(r => r.rating === 2).length,
        1: reviews.filter(r => r.rating === 1).length
      };

      return {
        _id: product._id,
        name: product.title,
        image: product.images?.[0]?.url,
        category: product.category,
        averageRating: avgRating,
        reviewCount: reviews.length,
        ratingBreakdown,
        recentReviews: reviews.slice(0, 3).map(r => ({
          rating: r.rating,
          comment: r.comment,
          userName: r.userName,
          createdAt: r.createdAt
        }))
      };
    }));

    // Sort based on query
    let sortedProducts = [...productReviewData];
    switch(sort) {
      case "rating-high":
        sortedProducts.sort((a, b) => b.averageRating - a.averageRating);
        break;
      case "rating-low":
        sortedProducts.sort((a, b) => a.averageRating - b.averageRating);
        break;
      case "recent":
        sortedProducts.sort((a, b) => {
          const aRecent = a.recentReviews[0]?.createdAt || new Date(0);
          const bRecent = b.recentReviews[0]?.createdAt || new Date(0);
          return new Date(bRecent) - new Date(aRecent);
        });
        break;
      default: // reviews count
        sortedProducts.sort((a, b) => b.reviewCount - a.reviewCount);
    }

    res.status(200).json({
      success: true,
      data: sortedProducts
    });
  } catch (error) {
    console.error("Product Reviews Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Get My Reviews (All reviews for seller's products)
export const getMyReviews = async (req, res) => {
  try {
    const sellerId = req.sellerId; // SECURITY: IDOR fix — never trust req.body.sellerId
    const { page = 1, limit = 20, rating, responded } = req.query;

    const products = await addproductmodel.find({ sellerId });
    const productIds = products.map(p => p._id);

    let query = { productId: { $in: productIds } };
    if (rating) query.rating = parseInt(rating);

    const reviews = await Review.find(query)
      .populate("productId", "title images")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const totalCount = await Review.countDocuments(query);
    const allReviews = await Review.find({ productId: { $in: productIds } });

    const stats = {
      total: allReviews.length,
      average: allReviews.length > 0 
        ? (allReviews.reduce((acc, r) => acc + r.rating, 0) / allReviews.length).toFixed(1) 
        : 0,
      distribution: {
        5: allReviews.filter(r => r.rating === 5).length,
        4: allReviews.filter(r => r.rating === 4).length,
        3: allReviews.filter(r => r.rating === 3).length,
        2: allReviews.filter(r => r.rating === 2).length,
        1: allReviews.filter(r => r.rating === 1).length
      },
      responded: 0,
      pending: allReviews.length
    };

    res.status(200).json({
      success: true,
      data: {
        reviews,
        stats,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCount / limit),
          totalItems: totalCount
        }
      }
    });
  } catch (error) {
    console.error("My Reviews Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Get Product Reviews (Specific product)
export const getProductReviewsForSeller = async (req, res) => {
  try {
    const sellerId = req.sellerId; // SECURITY: IDOR fix — never trust req.body.sellerId
    const { productId } = req.query;

    // Verify product belongs to seller
    const product = await addproductmodel.findOne({ _id: productId, sellerId });
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    const reviews = await Review.find({ productId })
      .sort({ createdAt: -1 });

    const stats = {
      total: reviews.length,
      average: reviews.length > 0 
        ? (reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length).toFixed(1) 
        : 0,
      distribution: {
        5: reviews.filter(r => r.rating === 5).length,
        4: reviews.filter(r => r.rating === 4).length,
        3: reviews.filter(r => r.rating === 3).length,
        2: reviews.filter(r => r.rating === 2).length,
        1: reviews.filter(r => r.rating === 1).length
      }
    };

    res.status(200).json({
      success: true,
      data: {
        product: {
          _id: product._id,
          title: product.title,
          image: product.images?.[0]?.url
        },
        reviews,
        stats
      }
    });
  } catch (error) {
    console.error("Product Reviews Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Get Store Reviews (Aggregate of all product reviews)
export const getStoreReviews = async (req, res) => {
  try {
    const sellerId = req.sellerId; // SECURITY: IDOR fix — never trust req.body.sellerId
    const { filter = "all" } = req.query;

    const products = await addproductmodel.find({ sellerId });
    const productIds = products.map(p => p._id);

    let query = { productId: { $in: productIds } };
    
    // Apply filter
    if (filter === "positive") {
      query.rating = { $gte: 4 };
    } else if (filter === "negative") {
      query.rating = { $lte: 2 };
    } else if (filter === "pending") {
      query.sellerResponse = { $exists: false };
    }

    const reviews = await Review.find(query)
      .populate("productId", "title images")
      .sort({ createdAt: -1 });

    // Get all reviews for stats calculation
    const allReviews = await Review.find({ productId: { $in: productIds } });

    // Calculate store rating
    const storeRating = allReviews.length > 0 
      ? allReviews.reduce((acc, r) => acc + r.rating, 0) / allReviews.length 
      : 0;

    // Rating breakdown
    const ratingBreakdown = {
      5: allReviews.filter(r => r.rating === 5).length,
      4: allReviews.filter(r => r.rating === 4).length,
      3: allReviews.filter(r => r.rating === 3).length,
      2: allReviews.filter(r => r.rating === 2).length,
      1: allReviews.filter(r => r.rating === 1).length
    };

    // Calculate response rate and other metrics
    const respondedReviews = allReviews.filter(r => r.sellerResponse).length;
    const responseRate = allReviews.length > 0 
      ? Math.round((respondedReviews / allReviews.length) * 100) 
      : 0;

    const positiveReviews = allReviews.filter(r => r.rating >= 4).length;
    const positiveRate = allReviews.length > 0 
      ? Math.round((positiveReviews / allReviews.length) * 100) 
      : 0;

    // Calculate 30-day trend
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const recentReviews = allReviews.filter(r => new Date(r.createdAt) >= thirtyDaysAgo);
    const previousReviews = allReviews.filter(r => 
      new Date(r.createdAt) >= sixtyDaysAgo && new Date(r.createdAt) < thirtyDaysAgo
    );

    const recentAvg = recentReviews.length > 0 
      ? recentReviews.reduce((acc, r) => acc + r.rating, 0) / recentReviews.length 
      : 0;
    const previousAvg = previousReviews.length > 0 
      ? previousReviews.reduce((acc, r) => acc + r.rating, 0) / previousReviews.length 
      : 0;
    const recentTrend = recentAvg - previousAvg;

    // Format reviews for frontend
    const formattedReviews = reviews.map(r => ({
      _id: r._id,
      customerName: r.userName || "Anonymous Customer",
      rating: r.rating,
      comment: r.comment,
      title: r.title,
      productName: r.productId?.title,
      productImage: r.productId?.images?.[0]?.url,
      createdAt: r.createdAt,
      response: r.sellerResponse,
      isVerified: true
    }));

    res.status(200).json({
      success: true,
      data: {
        reviews: formattedReviews,
        stats: {
          overallRating: storeRating,
          totalReviews: allReviews.length,
          ratingBreakdown,
          responseRate,
          avgResponseTime: respondedReviews > 0 ? 24 : 0,
          respondedReviews,
          positiveRate,
          verifiedPurchases: allReviews.length > 0
            ? parseFloat(((allReviews.filter(r => r.isVerifiedPurchase).length / allReviews.length) * 100).toFixed(0))
            : 0,
          recentTrend
        }
      }
    });
  } catch (error) {
    console.error("Store Reviews Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Respond to Review
export const respondToReview = async (req, res) => {
  try {
    const sellerId = req.sellerId; // SECURITY: IDOR fix — never trust req.body.sellerId
    const reviewId = req.params.reviewId || req.body.reviewId;
    const { response } = req.body;

    if (!reviewId || !response) {
      return res.status(400).json({ success: false, message: "Review ID and response are required" });
    }

    const review = await Review.findById(reviewId).populate("productId", "sellerId");
    
    if (!review) {
      return res.status(404).json({ success: false, message: "Review not found" });
    }

    // Verify the review is for seller's product
    if (review.productId?.sellerId?.toString() !== sellerId.toString()) {
      return res.status(403).json({ success: false, message: "Not authorized to respond to this review" });
    }

    // Update review with seller response
    review.sellerResponse = response;
    review.respondedAt = new Date();
    await review.save();

    res.status(200).json({ 
      success: true, 
      message: "Response submitted successfully",
      data: review
    });
  } catch (error) {
    console.error("Respond to Review Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Get Review Requests (Customers who haven't reviewed their purchases)
export const getReviewRequests = async (req, res) => {
  try {
    const sellerId = req.sellerId; // SECURITY: IDOR fix — never trust req.body.sellerId

    const completedOrders = await orderModel.find({
      "items.sellerId": sellerId,
      status: { $in: ["Delivered", "Completed"] }
    }).populate("user", "name email");

    const products = await addproductmodel.find({ sellerId });
    const productIds = products.map(p => p._id.toString());
    const productMap = {};
    products.forEach(p => {
      productMap[p._id.toString()] = {
        name: p.title,
        image: p.images?.[0]?.url
      };
    });

    const reviews = await Review.find({ productId: { $in: productIds } });
    const reviewedProducts = new Set(reviews.map(r => `${r.productId}-${r.userName}`));

    const pendingReviewRequests = [];

    completedOrders.forEach(order => {
      order.items.forEach(item => {
        if (item.sellerId?.toString() === sellerId.toString()) {
          const key = `${item.productId}-${order.user?.name || order.shippingAddress?.name}`;
          if (!reviewedProducts.has(key)) {
            const productInfo = productMap[item.productId?.toString()] || {};
            pendingReviewRequests.push({
              _id: order._id,
              orderId: order._id.toString().slice(-8).toUpperCase(),
              productId: item.productId,
              productName: item.name || productInfo.name || "Unknown Product",
              productImage: item.image || productInfo.image,
              customerName: order.user?.name || order.shippingAddress?.name || "Customer",
              email: order.user?.email,
              deliveredAt: order.deliveredAt || order.updatedAt || order.placedAt,
              reviewRequested: order.reviewRequested || false,
              daysSinceDelivery: Math.floor((Date.now() - (order.deliveredAt || order.updatedAt || order.placedAt)) / (1000 * 60 * 60 * 24))
            });
          }
        }
      });
    });

    // Calculate stats
    const requestsSent = pendingReviewRequests.filter(r => r.reviewRequested).length;
    const reviewsReceived = reviews.length;
    const totalRequests = requestsSent + reviewsReceived;
    const conversionRate = totalRequests > 0 
      ? Math.round((reviewsReceived / totalRequests) * 100) 
      : 0;

    res.status(200).json({
      success: true,
      data: {
        orders: pendingReviewRequests.slice(0, 50),
        settings: {
          autoRequest: false,
          delayDays: 3,
          reminderEnabled: false,
          reminderDays: 7
        },
        stats: {
          requestsSent,
          reviewsReceived,
          conversionRate
        }
      }
    });
  } catch (error) {
    console.error("Review Requests Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Get Rating Insights
export const getRatingInsights = async (req, res) => {
  try {
    const sellerId = req.sellerId; // SECURITY: IDOR fix — never trust req.body.sellerId
    const { period = "6months" } = req.query;

    // Calculate start date based on period
    const startDate = new Date();
    switch(period) {
      case "1month": startDate.setMonth(startDate.getMonth() - 1); break;
      case "3months": startDate.setMonth(startDate.getMonth() - 3); break;
      case "6months": startDate.setMonth(startDate.getMonth() - 6); break;
      case "1year": startDate.setFullYear(startDate.getFullYear() - 1); break;
      default: startDate.setMonth(startDate.getMonth() - 6);
    }

    const products = await addproductmodel.find({ sellerId });
    const productIds = products.map(p => p._id);

    const allReviews = await Review.find({ productId: { $in: productIds } })
      .populate("productId", "title images category");

    const periodReviews = allReviews.filter(r => new Date(r.createdAt) >= startDate);

    // Current rating
    const currentRating = allReviews.length > 0 
      ? allReviews.reduce((acc, r) => acc + r.rating, 0) / allReviews.length 
      : 0;

    // Calculate rating change (compare last 30 days to previous 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const recentReviews = allReviews.filter(r => new Date(r.createdAt) >= thirtyDaysAgo);
    const previousReviews = allReviews.filter(r => 
      new Date(r.createdAt) >= sixtyDaysAgo && new Date(r.createdAt) < thirtyDaysAgo
    );

    const recentAvg = recentReviews.length > 0 
      ? recentReviews.reduce((acc, r) => acc + r.rating, 0) / recentReviews.length 
      : 0;
    const previousAvg = previousReviews.length > 0 
      ? previousReviews.reduce((acc, r) => acc + r.rating, 0) / previousReviews.length 
      : 0;
    const ratingChange = recentAvg - previousAvg;

    // Five star rate
    const fiveStarCount = periodReviews.filter(r => r.rating === 5).length;
    const fiveStarRate = periodReviews.length > 0 
      ? Math.round((fiveStarCount / periodReviews.length) * 100) 
      : 0;

    // Monthly breakdown for rating trend
    const monthlyData = {};
    periodReviews.forEach(review => {
      const monthKey = new Date(review.createdAt).toLocaleString('default', { month: 'short' });
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = { ratings: [], count: 0 };
      }
      monthlyData[monthKey].ratings.push(review.rating);
      monthlyData[monthKey].count++;
    });

    const ratingTrend = Object.entries(monthlyData)
      .map(([month, data]) => ({
        month,
        rating: data.ratings.length > 0 
          ? data.ratings.reduce((a, b) => a + b, 0) / data.ratings.length 
          : 0
      }));

    const monthlyBreakdown = Object.entries(monthlyData)
      .map(([month, data]) => ({ month, count: data.count }));

    // Product performance
    const productRatings = {};
    allReviews.forEach(review => {
      const prodId = review.productId?._id?.toString();
      if (prodId) {
        if (!productRatings[prodId]) {
          productRatings[prodId] = {
            name: review.productId.title,
            image: review.productId.images?.[0]?.url,
            category: review.productId.category,
            ratings: [],
            reviewCount: 0
          };
        }
        productRatings[prodId].ratings.push(review.rating);
        productRatings[prodId].reviewCount++;
      }
    });

    const sortedProducts = Object.values(productRatings)
      .map(p => ({
        ...p,
        rating: p.ratings.length > 0 
          ? p.ratings.reduce((a, b) => a + b, 0) / p.ratings.length 
          : 0
      }))
      .sort((a, b) => b.rating - a.rating);

    const topRatedProducts = sortedProducts.slice(0, 5);
    const lowRatedProducts = sortedProducts.filter(p => p.rating < 3).slice(0, 5);

    // Category ratings
    const categoryData = {};
    Object.values(productRatings).forEach(p => {
      if (p.category) {
        if (!categoryData[p.category]) {
          categoryData[p.category] = { ratings: [] };
        }
        categoryData[p.category].ratings.push(...p.ratings);
      }
    });

    const categoryRatings = Object.entries(categoryData)
      .map(([category, data]) => ({
        category,
        rating: data.ratings.length > 0 
          ? data.ratings.reduce((a, b) => a + b, 0) / data.ratings.length 
          : 0
      }))
      .sort((a, b) => b.rating - a.rating);

    // Common phrases (simplified - just count keywords from comments)
    const positiveKeywords = ['great', 'excellent', 'amazing', 'love', 'perfect', 'best', 'quality', 'fast', 'recommended'];
    const negativeKeywords = ['bad', 'poor', 'slow', 'damaged', 'broken', 'late', 'wrong', 'disappointed', 'issue'];

    const countKeywords = (reviews, keywords) => {
      const counts = {};
      keywords.forEach(word => counts[word] = 0);
      
      reviews.forEach(r => {
        const comment = (r.comment || '').toLowerCase();
        keywords.forEach(word => {
          if (comment.includes(word)) counts[word]++;
        });
      });

      return Object.entries(counts)
        .filter(([_, count]) => count > 0)
        .map(([word, count]) => ({ word, count }))
        .sort((a, b) => b.count - a.count);
    };

    const positiveReviews = periodReviews.filter(r => r.rating >= 4);
    const negativeReviews = periodReviews.filter(r => r.rating <= 2);

    res.status(200).json({
      success: true,
      data: {
        currentRating,
        ratingChange,
        totalReviews: periodReviews.length,
        fiveStarRate,
        ratingTrend,
        monthlyBreakdown,
        topRatedProducts,
        lowRatedProducts,
        categoryRatings,
        commonPhrases: {
          positive: countKeywords(positiveReviews, positiveKeywords),
          negative: countKeywords(negativeReviews, negativeKeywords)
        }
      }
    });
  } catch (error) {
    console.error("Rating Insights Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Get Response Queue (Reviews pending response)
export const getResponseQueue = async (req, res) => {
  try {
    const sellerId = req.sellerId; // SECURITY: IDOR fix — never trust req.body.sellerId
    const { status = "pending" } = req.query;

    const products = await addproductmodel.find({ sellerId });
    const productIds = products.map(p => p._id);

    let query = { productId: { $in: productIds } };

    const reviews = await Review.find(query)
      .populate("productId", "title images")
      .sort({ createdAt: -1 });

    // Format reviews for response queue
    const formattedReviews = reviews.map(review => ({
      _id: review._id,
      customerName: review.userName || "Anonymous Customer",
      rating: review.rating,
      title: review.title,
      comment: review.comment,
      productName: review.productId?.title || "Unknown Product",
      productImage: review.productId?.images?.[0]?.url,
      createdAt: review.createdAt,
      response: review.sellerResponse || null,
      respondedAt: review.respondedAt || null
    }));

    // Filter by status
    let filteredReviews = formattedReviews;
    if (status === "pending") {
      filteredReviews = formattedReviews.filter(r => !r.response);
    } else if (status === "responded") {
      filteredReviews = formattedReviews.filter(r => r.response);
    }

    res.status(200).json({
      success: true,
      data: filteredReviews
    });
  } catch (error) {
    console.error("Response Queue Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};
