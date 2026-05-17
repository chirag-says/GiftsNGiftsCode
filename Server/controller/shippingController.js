import ShippingSettingsModel from "../model/shippingSettings.js";
import orderModel from "../model/order.js";

// Get All Shipping Settings (Consolidated)
export const getAllShippingSettings = async (req, res) => {
  try {
    const sellerId = req.sellerId; // SECURITY: IDOR fix — never trust req.body.sellerId

    let settings = await ShippingSettingsModel.findOne({ sellerId });

    if (!settings) {
      settings = new ShippingSettingsModel({
        sellerId,
        defaultShippingRate: 50,
        freeShippingThreshold: 500,
        processingTime: "1-2"
      });
      await settings.save();
    }

    res.status(200).json({ success: true, data: settings });
  } catch (error) {
    console.error("Get All Shipping Settings Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Update All Shipping Settings (Consolidated)
export const updateAllShippingSettings = async (req, res) => {
  try {
    const sellerId = req.sellerId; // SECURITY: IDOR fix — never trust req.body.sellerId
    const {
      freeShippingThreshold,
      defaultShippingRate,
      expressShippingRate,
      processingTime,
      deliveryPartners,
      shippingZones,
      packageDimensions,
      pickupAddress,
      returnAddress,
      defaultPickupTime,
      workingDays,
      pickupSchedule,
      codSettings,
      trackingSettings,
      bulkShipping
    } = req.body;

    let settings = await ShippingSettingsModel.findOne({ sellerId });

    if (settings) {
      // Update all fields
      if (freeShippingThreshold !== undefined) settings.freeShippingThreshold = freeShippingThreshold;
      if (defaultShippingRate !== undefined) settings.defaultShippingRate = defaultShippingRate;
      if (expressShippingRate !== undefined) settings.expressShippingRate = expressShippingRate;
      if (processingTime !== undefined) settings.processingTime = processingTime;
      if (deliveryPartners) settings.deliveryPartners = deliveryPartners;
      if (shippingZones) settings.shippingZones = shippingZones;
      if (packageDimensions) settings.packageDimensions = packageDimensions;
      if (pickupAddress) settings.pickupAddress = pickupAddress;
      if (returnAddress) settings.returnAddress = returnAddress;
      if (defaultPickupTime !== undefined) settings.defaultPickupTime = defaultPickupTime;
      if (workingDays) settings.workingDays = workingDays;
      if (pickupSchedule) settings.pickupSchedule = pickupSchedule;
      if (codSettings) settings.codSettings = codSettings;
      if (trackingSettings) settings.trackingSettings = trackingSettings;
      if (bulkShipping) settings.bulkShipping = bulkShipping;

      await settings.save();
    } else {
      settings = new ShippingSettingsModel({
        sellerId,
        freeShippingThreshold,
        defaultShippingRate,
        expressShippingRate,
        processingTime,
        deliveryPartners,
        shippingZones,
        packageDimensions,
        pickupAddress,
        returnAddress,
        defaultPickupTime,
        workingDays,
        pickupSchedule,
        codSettings,
        trackingSettings,
        bulkShipping
      });
      await settings.save();
    }

    res.status(200).json({ success: true, message: "Settings updated", data: settings });
  } catch (error) {
    console.error("Update All Shipping Settings Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Get Shipments (for tracking)
export const getShipments = async (req, res) => {
  try {
    const sellerId = req.sellerId; // SECURITY: IDOR fix — never trust req.body.sellerId

    const orders = await orderModel.find({
      "items.sellerId": sellerId,
      status: { $in: ["Pending", "Processing", "Shipped", "Out for Delivery", "Delivered"] }
    })
      .populate("user", "name email")
      .sort({ placedAt: -1 })
      .limit(100);

    const shipments = orders.map(order => {
      const sellerItems = order.items.filter(i => i.sellerId?.toString() === sellerId?.toString());
      return {
        orderId: order._id,
        customer: order.user?.name || order.shippingAddress?.name || "Customer",
        address: order.shippingAddress,
        items: sellerItems,
        total: sellerItems.reduce((acc, i) => acc + (i.price * i.quantity), 0),
        status: order.status,
        placedAt: order.placedAt,
        trackingNumber: order.trackingNumber || order.paymentId || "Awaiting",
        estimatedDelivery: order.estimatedDelivery || new Date(order.placedAt?.getTime() + 5 * 24 * 60 * 60 * 1000),
        timeline: order.timeline || []
      };
    });

    // Calculate status counts
    const statusCounts = {
      processing: orders.filter(o => o.status === "Processing").length,
      shipped: orders.filter(o => o.status === "Shipped").length,
      outForDelivery: orders.filter(o => o.status === "Out for Delivery").length,
      delivered: orders.filter(o => o.status === "Delivered").length
    };

    res.status(200).json({
      success: true,
      data: {
        orders: shipments,
        statusCounts
      }
    });
  } catch (error) {
    console.error("Get Shipments Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Get Shipping Settings
export const getShippingSettings = async (req, res) => {
  try {
    const sellerId = req.sellerId; // SECURITY: IDOR fix — never trust req.body.sellerId

    let settings = await ShippingSettingsModel.findOne({ sellerId });

    if (!settings) {
      settings = new ShippingSettingsModel({
        sellerId,
        defaultShippingRate: 50,
        freeShippingThreshold: 500,
        processingTime: "1-2"
      });
      await settings.save();
    }

    res.status(200).json({ success: true, data: settings });
  } catch (error) {
    console.error("Shipping Settings Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Update Shipping Settings
export const updateShippingSettings = async (req, res) => {
  try {
    const sellerId = req.sellerId;
    const { sellerId: bodySellerId, ...updateData } = req.body;

    let settings = await ShippingSettingsModel.findOne({ sellerId });

    if (settings) {
      Object.assign(settings, updateData);
      await settings.save();
    } else {
      settings = new ShippingSettingsModel({ sellerId, ...updateData });
      await settings.save();
    }

    res.status(200).json({ success: true, message: "Settings updated", data: settings });
  } catch (error) {
    console.error("Update Shipping Settings Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Get Delivery Partners
export const getDeliveryPartners = async (req, res) => {
  try {
    const { sellerId } = req.body;

    const settings = await ShippingSettingsModel.findOne({ sellerId });

    const defaultPartners = [
      { name: "Delhivery", isActive: false, priority: 1, logo: "delhivery" },
      { name: "BlueDart", isActive: false, priority: 2, logo: "bluedart" },
      { name: "DTDC", isActive: false, priority: 3, logo: "dtdc" },
      { name: "India Post", isActive: false, priority: 4, logo: "indiapost" },
      { name: "Ecom Express", isActive: false, priority: 5, logo: "ecom" }
    ];

    const partners = settings?.deliveryPartners?.length > 0
      ? settings.deliveryPartners
      : defaultPartners;

    res.status(200).json({
      success: true,
      data: {
        partners,
        availablePartners: defaultPartners
      }
    });
  } catch (error) {
    console.error("Delivery Partners Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Update Delivery Partners
export const updateDeliveryPartners = async (req, res) => {
  try {
    const { sellerId, deliveryPartners } = req.body;

    let settings = await ShippingSettingsModel.findOne({ sellerId });

    if (settings) {
      settings.deliveryPartners = deliveryPartners;
      await settings.save();
    } else {
      settings = new ShippingSettingsModel({ sellerId, deliveryPartners });
      await settings.save();
    }

    res.status(200).json({ success: true, message: "Partners updated", data: settings.deliveryPartners });
  } catch (error) {
    console.error("Update Delivery Partners Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Get Shipping Rates
export const getShippingRates = async (req, res) => {
  try {
    const { sellerId } = req.body;

    const settings = await ShippingSettingsModel.findOne({ sellerId });

    const defaultZones = [
      { zoneName: "Local", states: ["Same State"], rate: 30, deliveryDays: 2 },
      { zoneName: "North India", states: ["Delhi", "Punjab", "Haryana", "UP", "Rajasthan"], rate: 50, deliveryDays: 4 },
      { zoneName: "South India", states: ["Karnataka", "Tamil Nadu", "Kerala", "Andhra Pradesh"], rate: 60, deliveryDays: 5 },
      { zoneName: "East India", states: ["West Bengal", "Bihar", "Odisha", "Jharkhand"], rate: 70, deliveryDays: 5 },
      { zoneName: "West India", states: ["Maharashtra", "Gujarat", "Goa"], rate: 50, deliveryDays: 4 },
      { zoneName: "Northeast", states: ["Assam", "Meghalaya", "Manipur", "Tripura"], rate: 100, deliveryDays: 7 }
    ];

    res.status(200).json({
      success: true,
      data: {
        defaultRate: settings?.defaultShippingRate || 50,
        freeShippingThreshold: settings?.freeShippingThreshold || 500,
        zones: settings?.shippingZones?.length > 0 ? settings.shippingZones : defaultZones
      }
    });
  } catch (error) {
    console.error("Shipping Rates Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Add Shipping Rate
export const addShippingRate = async (req, res) => {
  try {
    const sellerId = req.sellerId;
    const newRate = req.body;

    let settings = await ShippingSettingsModel.findOne({ sellerId });
    if (!settings) {
      settings = new ShippingSettingsModel({ sellerId, shippingZones: [] });
    }

    settings.shippingZones.push(newRate);
    await settings.save();

    res.status(200).json({ success: true, message: "Shipping rate added", data: settings.shippingZones });
  } catch (error) {
    console.error("Add Shipping Rate Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Update Shipping Rate
export const updateShippingRate = async (req, res) => {
  try {
    const sellerId = req.sellerId;
    const { rateId } = req.params;
    const updateData = req.body;

    let settings = await ShippingSettingsModel.findOne({ sellerId });
    if (!settings) return res.status(404).json({ success: false, message: "Settings not found" });

    const rateIndex = settings.shippingZones.findIndex(z => z._id.toString() === rateId);
    if (rateIndex === -1) return res.status(404).json({ success: false, message: "Rate not found" });

    Object.assign(settings.shippingZones[rateIndex], updateData);
    await settings.save();

    res.status(200).json({ success: true, message: "Shipping rate updated", data: settings.shippingZones });
  } catch (error) {
    console.error("Update Shipping Rate Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Delete Shipping Rate
export const deleteShippingRate = async (req, res) => {
  try {
    const sellerId = req.sellerId;
    const { rateId } = req.params;

    let settings = await ShippingSettingsModel.findOne({ sellerId });
    if (!settings) return res.status(404).json({ success: false, message: "Settings not found" });

    settings.shippingZones = settings.shippingZones.filter(z => z._id.toString() !== rateId);
    await settings.save();

    res.status(200).json({ success: true, message: "Shipping rate deleted", data: settings.shippingZones });
  } catch (error) {
    console.error("Delete Shipping Rate Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Update Shipping Rates (Bulk/Legacy)
export const updateShippingRates = async (req, res) => {
  try {
    const { sellerId, defaultShippingRate, freeShippingThreshold, shippingZones } = req.body;

    let settings = await ShippingSettingsModel.findOne({ sellerId });

    if (settings) {
      if (defaultShippingRate !== undefined) settings.defaultShippingRate = defaultShippingRate;
      if (freeShippingThreshold !== undefined) settings.freeShippingThreshold = freeShippingThreshold;
      if (shippingZones) settings.shippingZones = shippingZones;
      await settings.save();
    } else {
      settings = new ShippingSettingsModel({
        sellerId,
        defaultShippingRate,
        freeShippingThreshold,
        shippingZones
      });
      await settings.save();
    }

    res.status(200).json({ success: true, message: "Settings updated", data: settings });
  } catch (error) {
    console.error("Update Shipping Rates Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Get Package Dimensions
export const getPackageDimensions = async (req, res) => {
  try {
    const { sellerId } = req.body;

    const settings = await ShippingSettingsModel.findOne({ sellerId });

    res.status(200).json({
      success: true,
      data: settings?.packageDimensions || []
    });
  } catch (error) {
    console.error("Package Dimensions Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Update Package Dimensions
export const updatePackageDimensions = async (req, res) => {
  try {
    const { sellerId, packageDimensions } = req.body;

    let settings = await ShippingSettingsModel.findOne({ sellerId });

    if (settings) {
      settings.packageDimensions = packageDimensions;
      await settings.save();
    } else {
      settings = new ShippingSettingsModel({ sellerId, packageDimensions });
      await settings.save();
    }

    res.status(200).json({ success: true, message: "Dimensions updated", data: settings.packageDimensions });
  } catch (error) {
    console.error("Update Package Dimensions Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Get Tracking Orders
export const getTrackingOrders = async (req, res) => {
  try {
    const { sellerId } = req.body;
    const { status } = req.query;

    let query = { "items.sellerId": sellerId };
    if (status) {
      query.status = status;
    } else {
      query.status = { $in: ["Processing", "Shipped", "Out for Delivery"] };
    }

    const orders = await orderModel.find(query)
      .populate("user", "name email")
      .sort({ placedAt: -1 });

    const trackingOrders = orders.map(order => {
      const sellerItems = order.items.filter(i => i.sellerId.toString() === sellerId.toString());
      return {
        orderId: order._id,
        customer: order.user?.name || order.shippingAddress?.name,
        address: order.shippingAddress,
        items: sellerItems,
        total: sellerItems.reduce((acc, i) => acc + i.price * i.quantity, 0),
        status: order.status,
        placedAt: order.placedAt,
        trackingNumber: order.paymentId || "Awaiting",
        estimatedDelivery: new Date(order.placedAt.getTime() + 5 * 24 * 60 * 60 * 1000)
      };
    });

    res.status(200).json({
      success: true,
      data: {
        orders: trackingOrders,
        statusCounts: {
          processing: orders.filter(o => o.status === "Processing").length,
          shipped: orders.filter(o => o.status === "Shipped").length,
          outForDelivery: orders.filter(o => o.status === "Out for Delivery").length
        }
      }
    });
  } catch (error) {
    console.error("Tracking Orders Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Get Pickup Schedule
export const getPickupSchedule = async (req, res) => {
  try {
    const { sellerId } = req.body;

    const settings = await ShippingSettingsModel.findOne({ sellerId });

    const defaultSchedule = [
      { day: "Monday", timeSlot: "10:00 AM - 2:00 PM", isActive: true },
      { day: "Tuesday", timeSlot: "10:00 AM - 2:00 PM", isActive: true },
      { day: "Wednesday", timeSlot: "10:00 AM - 2:00 PM", isActive: true },
      { day: "Thursday", timeSlot: "10:00 AM - 2:00 PM", isActive: true },
      { day: "Friday", timeSlot: "10:00 AM - 2:00 PM", isActive: true },
      { day: "Saturday", timeSlot: "10:00 AM - 12:00 PM", isActive: false },
      { day: "Sunday", timeSlot: "Closed", isActive: false }
    ];

    res.status(200).json({
      success: true,
      data: {
        schedule: settings?.pickupSchedule?.length > 0 ? settings.pickupSchedule : defaultSchedule,
        pickupAddress: settings?.pickupAddress
      }
    });
  } catch (error) {
    console.error("Pickup Schedule Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Update Pickup Schedule
export const updatePickupSchedule = async (req, res) => {
  try {
    const { sellerId, pickupSchedule, pickupAddress } = req.body;

    let settings = await ShippingSettingsModel.findOne({ sellerId });

    if (settings) {
      if (pickupSchedule) settings.pickupSchedule = pickupSchedule;
      if (pickupAddress) settings.pickupAddress = pickupAddress;
      await settings.save();
    } else {
      settings = new ShippingSettingsModel({ sellerId, pickupSchedule, pickupAddress });
      await settings.save();
    }

    res.status(200).json({ success: true, message: "Schedule updated", data: settings });
  } catch (error) {
    console.error("Update Pickup Schedule Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Get Return Address
export const getReturnAddress = async (req, res) => {
  try {
    const { sellerId } = req.body;

    const settings = await ShippingSettingsModel.findOne({ sellerId });

    res.status(200).json({
      success: true,
      data: {
        returnAddress: settings?.returnAddress,
        pickupAddress: settings?.pickupAddress,
        sameAsPickup: settings?.returnAddress?.sameAsPickup ?? true
      }
    });
  } catch (error) {
    console.error("Return Address Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Update Return Address
export const updateReturnAddress = async (req, res) => {
  try {
    const { sellerId, returnAddress } = req.body;

    let settings = await ShippingSettingsModel.findOne({ sellerId });

    if (settings) {
      settings.returnAddress = returnAddress;
      await settings.save();
    } else {
      settings = new ShippingSettingsModel({ sellerId, returnAddress });
      await settings.save();
    }

    res.status(200).json({ success: true, message: "Return address updated", data: settings.returnAddress });
  } catch (error) {
    console.error("Update Return Address Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};
