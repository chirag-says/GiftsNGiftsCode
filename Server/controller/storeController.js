import StoreSettingsModel from "../model/storeSettings.js";
import sellermodel from "../model/sellermodel.js";
import orderModel from "../model/order.js";
import addproductmodel from "../model/addproduct.js";
import Review from "../model/review.js";
import { v2 as cloudinary } from 'cloudinary';

// Get Store Settings
export const getStoreSettings = async (req, res) => {
  try {
    const sellerId = req.sellerId; // SECURITY: IDOR fix — never trust req.body.sellerId

    let settings = await StoreSettingsModel.findOne({ sellerId });
    const seller = await sellermodel.findById(sellerId);

    if (!settings && seller) {
      // Create default settings
      settings = new StoreSettingsModel({
        sellerId,
        storeName: seller.nickName || seller.name,
        storeDescription: seller.about || ""
      });
      await settings.save();
    }
    res.status(200).json({ success: true, data: settings, seller });
  } catch (error) {
    console.error("Store Settings Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Update Store Settings
export const updateStoreSettings = async (req, res) => {
  try {
    const sellerId = req.sellerId; // SECURITY: IDOR fix — never trust req.body.sellerId
    const updateData = req.body;

    // Handle file uploads
    if (req.files) {
      if (req.files.storeLogo && req.files.storeLogo[0]) {
        const result = await cloudinary.uploader.upload(req.files.storeLogo[0].path, {
          folder: "store_logos"
        });
        updateData.storeLogo = result.secure_url;
      }
      if (req.files.storeBanner && req.files.storeBanner[0]) {
        const result = await cloudinary.uploader.upload(req.files.storeBanner[0].path, {
          folder: "store_banners"
        });
        updateData.storeBanner = result.secure_url;
      }
    }

    let settings = await StoreSettingsModel.findOne({ sellerId });

    if (settings) {
      Object.assign(settings, updateData);
      await settings.save();
    } else {
      settings = new StoreSettingsModel({ sellerId, ...updateData });
      await settings.save();
    }

    res.status(200).json({ success: true, message: "Settings updated", data: settings });
  } catch (error) {
    console.error("Update Store Settings Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Get Business Info
export const getBusinessInfo = async (req, res) => {
  try {
    const sellerId = req.sellerId; // SECURITY: IDOR fix — never trust req.body.sellerId

    // Get from seller model (primary source)
    const seller = await sellermodel.findById(sellerId);

    // Also check store settings for backward compatibility
    const settings = await StoreSettingsModel.findOne({ sellerId });

    // Merge data with seller model taking priority
    const businessInfo = {
      // From seller model (new structure)
      ownerName: seller?.businessInfo?.ownerName || seller?.name || '',
      businessName: seller?.businessInfo?.businessName || settings?.businessInfo?.businessName || '',
      businessType: seller?.businessInfo?.businessType || settings?.businessInfo?.businessType || 'Individual',
      registrationNumber: seller?.businessInfo?.registrationNumber || settings?.businessInfo?.registrationNumber || '',
      businessAddress: seller?.businessInfo?.businessAddress || settings?.businessInfo?.businessAddress || '',
      businessCity: seller?.businessInfo?.businessCity || settings?.businessInfo?.businessCity || '',
      businessState: seller?.businessInfo?.businessState || settings?.businessInfo?.businessState || '',
      businessPincode: seller?.businessInfo?.businessPincode || settings?.businessInfo?.businessPincode || '',
      businessCountry: seller?.businessInfo?.businessCountry || settings?.businessInfo?.businessCountry || 'India',

      // PAN Details
      panNumber: seller?.businessInfo?.panNumber || settings?.businessInfo?.panNumber || '',
      personalPanNumber: seller?.businessInfo?.personalPanNumber || '',
      businessPanNumber: seller?.businessInfo?.businessPanNumber || '',

      // GST (Optional)
      gstNumber: seller?.businessInfo?.gstNumber || settings?.businessInfo?.gstNumber || ''
    };

    res.status(200).json({
      success: true,
      data: businessInfo
    });
  } catch (error) {
    console.error("Business Info Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Update Business Info
export const updateBusinessInfo = async (req, res) => {
  try {
    const sellerId = req.sellerId; // SECURITY: IDOR fix — never trust req.body.sellerId
    const businessInfoData = req.body.businessInfo || req.body;

    // Update in seller model (primary storage)
    const seller = await sellermodel.findById(sellerId);
    if (seller) {
      seller.businessInfo = {
        ...seller.businessInfo,
        ownerName: businessInfoData.ownerName || seller.businessInfo?.ownerName || '',
        businessName: businessInfoData.businessName || seller.businessInfo?.businessName || '',
        businessType: businessInfoData.businessType || seller.businessInfo?.businessType || 'Individual',
        registrationNumber: businessInfoData.registrationNumber || seller.businessInfo?.registrationNumber || '',
        businessAddress: businessInfoData.businessAddress || seller.businessInfo?.businessAddress || '',
        businessCity: businessInfoData.businessCity || seller.businessInfo?.businessCity || '',
        businessState: businessInfoData.businessState || seller.businessInfo?.businessState || '',
        businessPincode: businessInfoData.businessPincode || seller.businessInfo?.businessPincode || '',
        businessCountry: businessInfoData.businessCountry || seller.businessInfo?.businessCountry || 'India',
        panNumber: businessInfoData.panNumber || seller.businessInfo?.panNumber || '',
        personalPanNumber: businessInfoData.personalPanNumber || seller.businessInfo?.personalPanNumber || '',
        businessPanNumber: businessInfoData.businessPanNumber || seller.businessInfo?.businessPanNumber || '',
        gstNumber: businessInfoData.gstNumber || seller.businessInfo?.gstNumber || ''
      };
      await seller.save();
    }

    // Also update in store settings for backward compatibility
    let settings = await StoreSettingsModel.findOne({ sellerId });
    if (settings) {
      settings.businessInfo = { ...settings.businessInfo, ...businessInfoData };
      await settings.save();
    } else {
      settings = new StoreSettingsModel({
        sellerId,
        storeName: "My Store",
        businessInfo: businessInfoData
      });
      await settings.save();
    }

    res.status(200).json({ success: true, message: "Business info updated", data: seller?.businessInfo || businessInfoData });
  } catch (error) {
    console.error("Update Business Info Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Get Store Customization
export const getStoreCustomization = async (req, res) => {
  try {
    const sellerId = req.sellerId; // SECURITY: IDOR fix — never trust req.body.sellerId

    const settings = await StoreSettingsModel.findOne({ sellerId });

    res.status(200).json({
      success: true,
      data: {
        storeLogo: settings?.storeLogo,
        storeBanner: settings?.storeBanner,
        storeTheme: settings?.storeTheme,
        socialLinks: settings?.socialLinks,
        policies: settings?.policies
      }
    });
  } catch (error) {
    console.error("Store Customization Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Update Store Customization
export const updateStoreCustomization = async (req, res) => {
  try {
    const sellerId = req.sellerId; // SECURITY: IDOR fix — never trust req.body.sellerId
    const { storeLogo, storeBanner, storeTheme, socialLinks, policies } = req.body;

    let settings = await StoreSettingsModel.findOne({ sellerId });

    if (settings) {
      if (storeLogo) settings.storeLogo = storeLogo;
      if (storeBanner) settings.storeBanner = storeBanner;
      if (storeTheme) settings.storeTheme = { ...settings.storeTheme, ...storeTheme };
      if (socialLinks) settings.socialLinks = { ...settings.socialLinks, ...socialLinks };
      if (policies) settings.policies = { ...settings.policies, ...policies };
      await settings.save();
    } else {
      settings = new StoreSettingsModel({
        sellerId,
        storeName: "My Store",
        storeLogo,
        storeBanner,
        storeTheme,
        socialLinks,
        policies
      });
      await settings.save();
    }

    res.status(200).json({ success: true, message: "Customization updated", data: settings });
  } catch (error) {
    console.error("Update Store Customization Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Get Holiday Mode Status
export const getHolidayMode = async (req, res) => {
  try {
    const sellerId = req.sellerId;
    const settings = await StoreSettingsModel.findOne({ sellerId });
    const seller = await sellermodel.findById(sellerId);

    res.status(200).json({
      success: true,
      data: {
        holidayMode: settings?.holidayMode || { isEnabled: false },
        sellerHolidayMode: seller?.holidayMode || false
      }
    });
  } catch (error) {
    console.error("Holiday Mode Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Update Holiday Mode
export const updateHolidayMode = async (req, res) => {
  try {
    const sellerId = req.sellerId;
    const holidayMode = req.body;

    // Update in seller model
    await sellermodel.findByIdAndUpdate(sellerId, { holidayMode: holidayMode.isEnabled });

    // Update in store settings
    let settings = await StoreSettingsModel.findOne({ sellerId });
    if (settings) {
      settings.holidayMode = holidayMode;
      await settings.save();
    } else {
      settings = new StoreSettingsModel({
        sellerId,
        storeName: "My Store",
        holidayMode
      });
      await settings.save();
    }

    res.status(200).json({ success: true, message: "Holiday mode updated", data: settings.holidayMode });
  } catch (error) {
    console.error("Update Holiday Mode Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Get Store Performance
export const getStorePerformance = async (req, res) => {
  try {
    const sellerId = req.sellerId; // SECURITY: IDOR fix — never trust req.body.sellerId
    const { period = "30" } = req.query; // days

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period));

    // Get orders in period
    const orders = await orderModel.find({
      "items.sellerId": sellerId,
      placedAt: { $gte: startDate }
    });

    // Get all-time orders for comparison
    const allOrders = await orderModel.find({ "items.sellerId": sellerId });

    // Get products
    const products = await addproductmodel.find({ sellerId });
    const productIds = products.map(p => p._id);

    // Get reviews
    const reviews = await Review.find({ productId: { $in: productIds } });

    // Calculate metrics
    let periodRevenue = 0;
    let periodOrders = 0;
    let allTimeRevenue = 0;
    const dailyRevenue = {};

    orders.forEach(order => {
      const sellerItems = order.items.filter(item => item.sellerId.toString() === sellerId.toString());
      const orderTotal = sellerItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);
      periodRevenue += orderTotal;
      periodOrders++;

      const dateKey = order.placedAt.toISOString().split('T')[0];
      dailyRevenue[dateKey] = (dailyRevenue[dateKey] || 0) + orderTotal;
    });

    allOrders.forEach(order => {
      const sellerItems = order.items.filter(item => item.sellerId.toString() === sellerId.toString());
      allTimeRevenue += sellerItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    });

    const avgOrderValue = periodOrders > 0 ? periodRevenue / periodOrders : 0;
    const avgRating = reviews.length > 0
      ? reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length
      : 0;

    res.status(200).json({
      success: true,
      data: {
        period: parseInt(period),
        periodRevenue,
        periodOrders,
        allTimeRevenue,
        allTimeOrders: allOrders.length,
        totalProducts: products.length,
        activeProducts: products.filter(p => p.isAvailable).length,
        avgOrderValue,
        avgRating: avgRating.toFixed(1),
        totalReviews: reviews.length,
        dailyRevenue: Object.entries(dailyRevenue).map(([date, revenue]) => ({ date, revenue })).sort((a, b) => new Date(a.date) - new Date(b.date))
      }
    });
  } catch (error) {
    console.error("Store Performance Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Get Verification Status
export const getVerificationStatus = async (req, res) => {
  try {
    const sellerId = req.sellerId; // SECURITY: IDOR fix — never trust req.body.sellerId

    const settings = await StoreSettingsModel.findOne({ sellerId });
    const seller = await sellermodel.findById(sellerId);

    res.status(200).json({
      success: true,
      data: {
        isApproved: seller?.approved || false,
        verificationStatus: settings?.verificationStatus || {
          isVerified: false,
          documents: []
        },
        businessInfo: settings?.businessInfo || {}
      }
    });
  } catch (error) {
    console.error("Verification Status Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Submit Verification Documents
export const submitVerificationDocuments = async (req, res) => {
  try {
    const sellerId = req.sellerId; // SECURITY: IDOR fix — never trust req.body.sellerId
    const { documents } = req.body;

    let settings = await StoreSettingsModel.findOne({ sellerId });

    if (settings) {
      settings.verificationStatus.documents = documents.map(doc => ({
        ...doc,
        status: "pending"
      }));
      await settings.save();
    } else {
      settings = new StoreSettingsModel({
        sellerId,
        storeName: "My Store",
        verificationStatus: {
          isVerified: false,
          documents: documents.map(doc => ({ ...doc, status: "pending" }))
        }
      });
      await settings.save();
    }

    res.status(200).json({ success: true, message: "Documents submitted for verification" });
  } catch (error) {
    console.error("Submit Verification Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};
