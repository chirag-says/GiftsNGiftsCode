import CouponModel from "../model/coupon.js";
import addproductmodel from "../model/addproduct.js";
import orderModel from "../model/order.js";
import MarketingCampaign from "../model/marketingCampaign.js";

// ============ PROMOTIONS (Coupons + Discounts) ============

// Get All Coupons
export const getCoupons = async (req, res) => {
  try {
    const sellerId = req.sellerId; // SECURITY: IDOR fix — never trust req.body.sellerId

    const coupons = await CouponModel.find({ sellerId }).sort({ createdAt: -1 });

    const now = new Date();
    const activeCoupons = coupons.filter(c => c.isActive && new Date(c.validUntil) > now);
    const expiredCoupons = coupons.filter(c => new Date(c.validUntil) <= now);
    const scheduledCoupons = coupons.filter(c => new Date(c.validFrom) > now);

    // Calculate total savings/redemptions
    const totalRedemptions = coupons.reduce((acc, c) => acc + (c.usedCount || 0), 0);

    res.status(200).json({
      success: true,
      data: {
        coupons,
        stats: {
          total: coupons.length,
          active: activeCoupons.length,
          expired: expiredCoupons.length,
          scheduled: scheduledCoupons.length,
          totalRedemptions
        }
      }
    });
  } catch (error) {
    console.error("Get Coupons Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Create Coupon
export const createCoupon = async (req, res) => {
  try {
    const sellerId = req.sellerId; // SECURITY: IDOR fix — never trust req.body.sellerId
    const {
      code,
      description,
      discountType,
      discountValue,
      minOrderValue,
      maxDiscount,
      usageLimit,
      validFrom,
      validUntil,
      applicableProducts,
      applicableCategories
    } = req.body;

    if (!code || !discountType || !discountValue || !validUntil) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    // Check if code exists for this seller
    const existing = await CouponModel.findOne({ sellerId, code: code.toUpperCase() });
    if (existing) {
      return res.status(400).json({ success: false, message: "Coupon code already exists for your store" });
    }

    const coupon = new CouponModel({
      sellerId,
      code: code.toUpperCase(),
      description,
      discountType,
      discountValue,
      minOrderValue: minOrderValue || 0,
      maxDiscount: maxDiscount === "" ? undefined : maxDiscount,
      usageLimit: usageLimit === "" ? undefined : usageLimit,
      validFrom: validFrom || new Date(),
      validUntil,
      applicableProducts,
      applicableCategories
    });

    await coupon.save();

    res.status(201).json({ success: true, message: "Coupon created successfully", coupon });
  } catch (error) {
    console.error("Create Coupon Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Update Coupon
export const updateCoupon = async (req, res) => {
  try {
    const sellerId = req.sellerId; // SECURITY: IDOR fix — never trust req.body.sellerId
    const { couponId, ...updateData } = req.body;

    // Sanitize updateData for optional numeric fields
    if (updateData.maxDiscount === "") updateData.maxDiscount = undefined;
    if (updateData.usageLimit === "") updateData.usageLimit = undefined;
    if (updateData.minOrderValue === "") updateData.minOrderValue = 0;
    if (updateData.code) updateData.code = updateData.code.toUpperCase();

    const coupon = await CouponModel.findOne({ _id: couponId, sellerId });
    if (!coupon) {
      return res.status(404).json({ success: false, message: "Coupon not found" });
    }

    Object.assign(coupon, updateData);
    await coupon.save();

    res.status(200).json({ success: true, message: "Coupon updated", coupon });
  } catch (error) {
    console.error("Update Coupon Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Delete Coupon
export const deleteCoupon = async (req, res) => {
  try {
    const sellerId = req.sellerId; // SECURITY: IDOR fix — never trust req.body.sellerId
    const { couponId } = req.params;

    const coupon = await CouponModel.findOneAndDelete({ _id: couponId, sellerId });
    if (!coupon) {
      return res.status(404).json({ success: false, message: "Coupon not found" });
    }

    res.status(200).json({ success: true, message: "Coupon deleted" });
  } catch (error) {
    console.error("Delete Coupon Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Toggle Coupon Status
export const toggleCouponStatus = async (req, res) => {
  try {
    const sellerId = req.sellerId; // SECURITY: IDOR fix — never trust req.body.sellerId
    const { couponId } = req.body;

    const coupon = await CouponModel.findOne({ _id: couponId, sellerId });
    if (!coupon) {
      return res.status(404).json({ success: false, message: "Coupon not found" });
    }

    coupon.isActive = !coupon.isActive;
    await coupon.save();

    res.status(200).json({ success: true, message: `Coupon ${coupon.isActive ? 'activated' : 'deactivated'}`, coupon });
  } catch (error) {
    console.error("Toggle Coupon Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Get Store Discounts (Products with discounts + Seasonal offers)
export const getStoreDiscounts = async (req, res) => {
  try {
    const sellerId = req.sellerId; // SECURITY: IDOR fix — never trust req.body.sellerId

    const products = await addproductmodel.find({ sellerId })
      .populate("categoryname", "categoryname");

    const discountedProducts = products.filter(p => p.discount > 0);
    const fullPriceProducts = products.filter(p => !p.discount || p.discount === 0);

    // Calculate discount distribution
    const discountRanges = {
      "1-10%": discountedProducts.filter(p => p.discount >= 1 && p.discount <= 10).length,
      "11-25%": discountedProducts.filter(p => p.discount > 10 && p.discount <= 25).length,
      "26-50%": discountedProducts.filter(p => p.discount > 25 && p.discount <= 50).length,
      "51%+": discountedProducts.filter(p => p.discount > 50).length
    };

    // Calculate potential revenue impact
    const totalOriginalValue = discountedProducts.reduce((acc, p) => acc + (p.oldprice || p.price), 0);
    const totalDiscountedValue = discountedProducts.reduce((acc, p) => acc + p.price, 0);
    const totalSavings = totalOriginalValue - totalDiscountedValue;

    res.status(200).json({
      success: true,
      data: {
        products: products.map(p => ({
          _id: p._id,
          title: p.title,
          image: p.images?.[0]?.url,
          category: p.categoryname?.categoryname || "Uncategorized",
          price: p.price,
          oldPrice: p.oldprice,
          discount: p.discount || 0,
          stock: p.stock,
          availability: p.availability
        })).sort((a, b) => b.discount - a.discount),
        stats: {
          totalProducts: products.length,
          discountedCount: discountedProducts.length,
          fullPriceCount: fullPriceProducts.length,
          avgDiscount: discountedProducts.length > 0
            ? parseFloat((discountedProducts.reduce((acc, p) => acc + p.discount, 0) / discountedProducts.length).toFixed(1))
            : 0,
          totalSavings,
          discountRanges
        }
      }
    });
  } catch (error) {
    console.error("Store Discounts Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Update Product Discount
export const updateProductDiscount = async (req, res) => {
  try {
    const sellerId = req.sellerId; // SECURITY: IDOR fix — never trust req.body.sellerId
    const { productId, discount, price, oldPrice } = req.body;

    const product = await addproductmodel.findOne({ _id: productId, sellerId });
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    // If setting a discount, store old price first
    if (discount !== undefined && discount > 0) {
      if (!product.oldprice || product.oldprice <= product.price) {
        product.oldprice = product.price;
      }
      // Calculate new price based on discount
      product.price = Math.round(product.oldprice * (1 - discount / 100));
      product.discount = discount;
    } else if (discount === 0) {
      // Remove discount - restore to old price
      if (product.oldprice) {
        product.price = product.oldprice;
      }
      product.discount = 0;
    }

    if (price !== undefined) product.price = price;
    if (oldPrice !== undefined) product.oldprice = oldPrice;

    await product.save();

    res.status(200).json({ success: true, message: "Discount updated", product });
  } catch (error) {
    console.error("Update Product Discount Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Bulk Update Discounts
export const bulkUpdateDiscounts = async (req, res) => {
  try {
    const sellerId = req.sellerId; // SECURITY: IDOR fix — never trust req.body.sellerId
    const { productIds, discount, action } = req.body;

    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({ success: false, message: "No products selected" });
    }

    const products = await addproductmodel.find({ _id: { $in: productIds }, sellerId });

    for (const product of products) {
      if (action === 'apply' && discount > 0) {
        if (!product.oldprice || product.oldprice <= product.price) {
          product.oldprice = product.price;
        }
        product.price = Math.round(product.oldprice * (1 - discount / 100));
        product.discount = discount;
      } else if (action === 'remove') {
        if (product.oldprice) {
          product.price = product.oldprice;
        }
        product.discount = 0;
      }
      await product.save();
    }

    res.status(200).json({
      success: true,
      message: `Discount ${action === 'apply' ? 'applied to' : 'removed from'} ${products.length} products`
    });
  } catch (error) {
    console.error("Bulk Update Discounts Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ============ CAMPAIGNS & TOOLS ============

// Get Marketing Budget Overview
export const getMarketingBudget = async (req, res) => {
  try {
    const sellerId = req.sellerId; // SECURITY: IDOR fix — never trust req.body.sellerId

    // Get all campaigns for this seller
    const campaigns = await MarketingCampaign.find({ sellerId });

    const activeCampaigns = campaigns.filter(c => c.status === 'active');
    const totalBudget = campaigns.reduce((acc, c) => acc + (c.budget?.total || 0), 0);
    const totalSpent = campaigns.reduce((acc, c) => acc + (c.budget?.spent || 0), 0);

    // Calculate performance metrics
    const totalImpressions = campaigns.reduce((acc, c) => acc + (c.performance?.impressions || 0), 0);
    const totalClicks = campaigns.reduce((acc, c) => acc + (c.performance?.clicks || 0), 0);
    const totalConversions = campaigns.reduce((acc, c) => acc + (c.performance?.conversions || 0), 0);
    const totalRevenue = campaigns.reduce((acc, c) => acc + (c.performance?.revenue || 0), 0);

    res.status(200).json({
      success: true,
      data: {
        budget: {
          total: totalBudget,
          spent: totalSpent,
          remaining: totalBudget - totalSpent
        },
        campaigns: {
          total: campaigns.length,
          active: activeCampaigns.length,
          paused: campaigns.filter(c => c.status === 'paused').length,
          completed: campaigns.filter(c => c.status === 'completed').length
        },
        performance: {
          impressions: totalImpressions,
          clicks: totalClicks,
          conversions: totalConversions,
          revenue: totalRevenue,
          ctr: totalImpressions > 0 ? parseFloat(((totalClicks / totalImpressions) * 100).toFixed(2)) : 0,
          roas: totalSpent > 0 ? parseFloat((totalRevenue / totalSpent).toFixed(2)) : 0
        }
      }
    });
  } catch (error) {
    console.error("Marketing Budget Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Get All Campaigns
export const getCampaigns = async (req, res) => {
  try {
    const sellerId = req.sellerId; // SECURITY: IDOR fix — never trust req.body.sellerId
    const { status } = req.query;

    let query = { sellerId };
    if (status) query.status = status;

    const campaigns = await MarketingCampaign.find(query)
      .populate('targeting.products', 'title images price')
      .populate('targeting.categories', 'categoryname')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: campaigns
    });
  } catch (error) {
    console.error("Get Campaigns Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Create Campaign
export const createCampaign = async (req, res) => {
  try {
    const sellerId = req.sellerId; // SECURITY: IDOR fix — never trust req.body.sellerId
    const { name, type, budget, schedule, targeting } = req.body;

    if (!name || !type) {
      return res.status(400).json({ success: false, message: "Name and type are required" });
    }

    const campaign = new MarketingCampaign({
      sellerId,
      name,
      type,
      budget: {
        total: budget?.total || 0,
        daily: budget?.daily || 0,
        spent: 0
      },
      schedule: {
        startDate: schedule?.startDate || new Date(),
        endDate: schedule?.endDate
      },
      targeting: {
        products: targeting?.products || [],
        categories: targeting?.categories || [],
        audience: targeting?.audience || 'all'
      },
      status: 'draft'
    });

    await campaign.save();

    res.status(201).json({ success: true, message: "Campaign created", campaign });
  } catch (error) {
    console.error("Create Campaign Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Update Campaign
export const updateCampaign = async (req, res) => {
  try {
    const sellerId = req.sellerId; // SECURITY: IDOR fix — never trust req.body.sellerId
    const { campaignId, ...updateData } = req.body;

    const campaign = await MarketingCampaign.findOne({ _id: campaignId, sellerId });
    if (!campaign) {
      return res.status(404).json({ success: false, message: "Campaign not found" });
    }

    // Update nested objects properly
    if (updateData.budget) {
      campaign.budget = { ...campaign.budget.toObject(), ...updateData.budget };
      delete updateData.budget;
    }
    if (updateData.schedule) {
      campaign.schedule = { ...campaign.schedule.toObject(), ...updateData.schedule };
      delete updateData.schedule;
    }
    if (updateData.targeting) {
      campaign.targeting = { ...campaign.targeting.toObject(), ...updateData.targeting };
      delete updateData.targeting;
    }

    Object.assign(campaign, updateData);
    await campaign.save();

    res.status(200).json({ success: true, message: "Campaign updated", campaign });
  } catch (error) {
    console.error("Update Campaign Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Delete Campaign
export const deleteCampaign = async (req, res) => {
  try {
    const sellerId = req.sellerId; // SECURITY: IDOR fix — never trust req.body.sellerId
    const { campaignId } = req.params;

    const campaign = await MarketingCampaign.findOneAndDelete({ _id: campaignId, sellerId });
    if (!campaign) {
      return res.status(404).json({ success: false, message: "Campaign not found" });
    }

    res.status(200).json({ success: true, message: "Campaign deleted" });
  } catch (error) {
    console.error("Delete Campaign Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Toggle Campaign Status (start/pause)
export const toggleCampaignStatus = async (req, res) => {
  try {
    const sellerId = req.sellerId; // SECURITY: IDOR fix — never trust req.body.sellerId
    const { campaignId, status } = req.body;

    const campaign = await MarketingCampaign.findOne({ _id: campaignId, sellerId });
    if (!campaign) {
      return res.status(404).json({ success: false, message: "Campaign not found" });
    }

    if (status) {
      campaign.status = status;
    } else {
      // Toggle between active and paused
      campaign.status = campaign.status === 'active' ? 'paused' : 'active';
    }

    await campaign.save();

    res.status(200).json({ success: true, message: `Campaign ${campaign.status}`, campaign });
  } catch (error) {
    console.error("Toggle Campaign Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Get Promotional Tools
export const getPromotionalTools = async (req, res) => {
  try {
    const sellerId = req.sellerId; // SECURITY: IDOR fix — never trust req.body.sellerId

    const products = await addproductmodel.find({ sellerId });
    const coupons = await CouponModel.find({ sellerId, isActive: true });

    // Generate store URL for sharing
    const storeUrl = `${process.env.FRONTEND_URL || 'https://yourstore.com'}/seller/${sellerId}`;

    res.status(200).json({
      success: true,
      data: {
        storeUrl,
        qrCodeData: storeUrl, // Frontend can generate QR from this
        socialTemplates: [
          {
            platform: 'whatsapp',
            template: `ðŸŽ‰ Check out amazing deals at our store! Shop now: ${storeUrl}`
          },
          {
            platform: 'instagram',
            template: `âœ¨ New arrivals just dropped! Link in bio ðŸ›ï¸`
          },
          {
            platform: 'facebook',
            template: `ðŸ›’ Exclusive offers available now! Visit our store: ${storeUrl}`
          }
        ],
        activeCoupons: coupons.map(c => ({
          code: c.code,
          discount: c.discountType === 'percentage' ? `${c.discountValue}%` : `â‚¹${c.discountValue}`,
          validUntil: c.validUntil,
          shareText: `Use code ${c.code} to get ${c.discountType === 'percentage' ? `${c.discountValue}% off` : `â‚¹${c.discountValue} off`}!`
        })),
        stats: {
          totalProducts: products.length,
          activePromotions: coupons.length
        }
      }
    });
  } catch (error) {
    console.error("Promotional Tools Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ============ LEGACY EXPORTS (for backward compatibility) ============

export const getMyPromotions = async (req, res) => {
  try {
    const sellerId = req.sellerId; // SECURITY: IDOR fix — never trust req.body.sellerId

    const coupons = await CouponModel.find({ sellerId }).sort({ createdAt: -1 });
    const discountedProducts = await addproductmodel.find({ sellerId, discount: { $gt: 0 } });

    const now = new Date();
    const activePromotions = coupons.filter(c => c.isActive && new Date(c.validUntil) > now);

    res.status(200).json({
      success: true,
      data: {
        coupons,
        activeCount: activePromotions.length,
        expiredCount: coupons.filter(c => new Date(c.validUntil) <= now).length,
        discountedProducts: discountedProducts.length,
        totalRedemptions: coupons.reduce((acc, c) => acc + (c.usedCount || 0), 0)
      }
    });
  } catch (error) {
    console.error("My Promotions Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

export const getDiscountManager = async (req, res) => {
  return getStoreDiscounts(req, res);
};

export const getFeaturedProducts = async (req, res) => {
  try {
    const sellerId = req.sellerId; // SECURITY: IDOR fix — never trust req.body.sellerId

    const products = await addproductmodel.find({ sellerId })
      .populate("categoryname", "categoryname");

    const featured = products.filter(p => p.approved && p.stock > 10);

    res.status(200).json({
      success: true,
      data: {
        featuredProducts: featured.map(p => ({
          _id: p._id,
          title: p.title,
          image: p.images?.[0]?.url,
          category: p.categoryname?.categoryname,
          price: p.price,
          stock: p.stock,
          isFeatured: true
        })),
        allProducts: products.map(p => ({
          _id: p._id,
          title: p.title,
          image: p.images?.[0]?.url,
          category: p.categoryname?.categoryname,
          price: p.price,
          stock: p.stock,
          approved: p.approved
        }))
      }
    });
  } catch (error) {
    console.error("Featured Products Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

export const getSeasonalOffers = async (req, res) => {
  try {
    const sellerId = req.sellerId; // SECURITY: IDOR fix — never trust req.body.sellerId

    const coupons = await CouponModel.find({
      sellerId,
      validUntil: { $gte: new Date() }
    });

    const products = await addproductmodel.find({
      sellerId,
      discount: { $gte: 20 }
    });

    res.status(200).json({
      success: true,
      data: {
        activeCoupons: coupons,
        seasonalProducts: products.map(p => ({
          _id: p._id,
          title: p.title,
          image: p.images?.[0]?.url,
          price: p.price,
          oldPrice: p.oldprice,
          discount: p.discount
        })),
        suggestions: [
          { name: "Holiday Sale", description: "Create discounts for upcoming holidays" },
          { name: "Flash Sale", description: "Limited time offers drive urgency" },
          { name: "Bundle Deals", description: "Combine products for better value" }
        ]
      }
    });
  } catch (error) {
    console.error("Seasonal Offers Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};