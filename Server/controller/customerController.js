import orderModel from "../model/order.js";
import usermodel from "../model/mongobd_usermodel.js";
import Review from "../model/review.js";
import wishlistModel from "../model/wishlist.js";
import addproductmodel from "../model/addproduct.js";

// Get Order History by Customer
export const getCustomerOrderHistory = async (req, res) => {
  try {
    const sellerId = req.sellerId; // SECURITY: IDOR fix � never trust req.body.sellerId
    const { customerId, page = 1, limit = 20 } = req.query;

    let query = { "items.sellerId": sellerId };
    if (customerId) {
      query.user = customerId;
    }

    const orders = await orderModel.find(query)
      .populate("user", "name email")
      .sort({ placedAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const totalCount = await orderModel.countDocuments(query);

    const orderHistory = orders.map(order => {
      const sellerItems = order.items.filter(item => item.sellerId.toString() === sellerId.toString());
      return {
        orderId: order._id,
        date: order.placedAt,
        customer: {
          _id: order.user?._id,
          name: order.user?.name || order.shippingAddress?.name || "Guest",
          email: order.user?.email || "N/A"
        },
        items: sellerItems,
        total: sellerItems.reduce((acc, item) => acc + (item.price * item.quantity), 0),
        status: order.status,
        shippingAddress: order.shippingAddress
      };
    });

    res.status(200).json({
      success: true,
      data: {
        orders: orderHistory,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCount / limit),
          totalItems: totalCount
        }
      }
    });
  } catch (error) {
    console.error("Order History Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Get Customer Reviews for Seller's Products
export const getCustomerReviews = async (req, res) => {
  try {
    const sellerId = req.sellerId; // SECURITY: IDOR fix � never trust req.body.sellerId
    const { page = 1, limit = 20, rating } = req.query;

    // Get all seller's products
    const products = await addproductmodel.find({ sellerId });
    const productIds = products.map(p => p._id);

    let reviewQuery = { productId: { $in: productIds } };
    if (rating) {
      reviewQuery.rating = parseInt(rating);
    }

    const reviews = await Review.find(reviewQuery)
      .populate("productId", "title images")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const totalCount = await Review.countDocuments(reviewQuery);

    // Calculate review stats
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
      }
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
    console.error("Customer Reviews Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Get Wishlist Insights
// ... (imports remain unchanged)
// import wishlistModel from "../model/wishlist.js";
// import addproductmodel from "../model/addproduct.js";

// Get Wishlist Insights
export const getWishlistInsights = async (req, res) => {
  try {
    const sellerId = req.sellerId; // SECURITY: IDOR fix � never trust req.body.sellerId
    
    if (!sellerId) {
      return res.status(400).json({ success: false, message: "Seller ID required" });
    }

    // Find all wishlists and populate products with sellerId
    const wishlists = await wishlistModel.find()
      .populate("userId", "name email")
      .populate({
        path: "products",
        select: "title price images stock sellerId",
        match: { sellerId: sellerId } // Only get products from this seller
      });

    const productWishlistCount = {};
    const uniqueUsers = new Set();

    wishlists.forEach(wishlist => {
      if (wishlist.products && wishlist.products.length > 0) {
        wishlist.products.forEach(product => {
          if (product) { // Product exists and belongs to seller (filtered by match)
            const prodId = product._id.toString();
            if (!productWishlistCount[prodId]) {
              productWishlistCount[prodId] = {
                product: {
                  _id: product._id,
                  title: product.title,
                  price: product.price,
                  images: product.images,
                  stock: product.stock
                },
                count: 0,
                users: [] // Array to store user info
              };
            }
            productWishlistCount[prodId].count++;
            if (wishlist.userId) {
              uniqueUsers.add(wishlist.userId._id.toString());
              // Pushing user data to the array
              productWishlistCount[prodId].users.push({
                userId: wishlist.userId._id, // Added user ID for potential linking
                name: wishlist.userId.name,
                email: wishlist.userId.email
              });
            }
          }
        });
      }
    });

    const wishlistData = Object.values(productWishlistCount)
      .sort((a, b) => b.count - a.count)
      .slice(0, 20); // wishlistData now includes the 'users' array for each item

    res.status(200).json({
      success: true,
      data: {
        totalWishlistAdditions: wishlistData.reduce((acc, w) => acc + w.count, 0),
        uniqueCustomers: uniqueUsers.size,
        topWishlistedProducts: wishlistData
      }
    });
  } catch (error) {
    console.error("Wishlist Insights Error:", error);
    res.status(500).json({ success: false, message: "Server Error", error: error.message });
  }
};
// Get Customer Messages (using orders communication)
export const getCustomerMessages = async (req, res) => {
  try {
    const sellerId = req.sellerId; // SECURITY: IDOR fix � never trust req.body.sellerId

    // Get unique customers from orders
    const orders = await orderModel.find({ "items.sellerId": sellerId })
      .populate("user", "name email")
      .sort({ placedAt: -1 });

    const customerMessages = [];
    const seenCustomers = new Set();

    orders.forEach(order => {
      const customerId = order.user?._id?.toString() || order.shippingAddress?.phone;
      if (customerId && !seenCustomers.has(customerId)) {
        seenCustomers.add(customerId);
        customerMessages.push({
          customerId,
          customerName: order.user?.name || order.shippingAddress?.name || "Guest",
          customerEmail: order.user?.email || "N/A",
          lastOrderId: order._id,
          lastOrderDate: order.placedAt,
          orderStatus: order.status,
          messages: [] // Placeholder for actual messaging system
        });
      }
    });

    res.status(200).json({
      success: true,
      data: {
        conversations: customerMessages.slice(0, 50),
        totalCustomers: customerMessages.length
      }
    });
  } catch (error) {
    console.error("Customer Messages Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Get Loyalty Program Data
export const getLoyaltyProgram = async (req, res) => {
  try {
    const sellerId = req.sellerId; // SECURITY: IDOR fix � never trust req.body.sellerId
    
    if (!sellerId) {
      return res.status(400).json({ success: false, message: "Seller ID required" });
    }

    const orders = await orderModel.find({ "items.sellerId": sellerId })
      .populate("user", "name email");

    const customerStats = {};

    orders.forEach(order => {
      const customerId = order.user?._id?.toString();
      if (customerId) {
        const sellerItems = order.items.filter(item => item.sellerId.toString() === sellerId.toString());
        const orderTotal = sellerItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);

        if (!customerStats[customerId]) {
          customerStats[customerId] = {
            _id: customerId,
            name: order.user.name,
            email: order.user.email,
            totalOrders: 0,
            totalSpent: 0,
            points: 0,
            tier: "Bronze"
          };
        }

        customerStats[customerId].totalOrders++;
        customerStats[customerId].totalSpent += orderTotal;
        customerStats[customerId].points += Math.floor(orderTotal / 10); // 1 point per ₹10
      }
    });

    // Assign tiers based on points
    Object.values(customerStats).forEach(customer => {
      if (customer.points >= 5000) customer.tier = "Platinum";
      else if (customer.points >= 2000) customer.tier = "Gold";
      else if (customer.points >= 500) customer.tier = "Silver";
      else customer.tier = "Bronze";
    });

    const loyaltyCustomers = Object.values(customerStats).sort((a, b) => b.points - a.points);

    res.status(200).json({
      success: true,
      data: {
        customers: loyaltyCustomers,
        tierDistribution: {
          platinum: loyaltyCustomers.filter(c => c.tier === "Platinum").length,
          gold: loyaltyCustomers.filter(c => c.tier === "Gold").length,
          silver: loyaltyCustomers.filter(c => c.tier === "Silver").length,
          bronze: loyaltyCustomers.filter(c => c.tier === "Bronze").length
        },
        totalPointsIssued: loyaltyCustomers.reduce((acc, c) => acc + c.points, 0)
      }
    });
  } catch (error) {
    console.error("Loyalty Program Error:", error);
    res.status(500).json({ success: false, message: "Server Error", error: error.message });
  }
};
