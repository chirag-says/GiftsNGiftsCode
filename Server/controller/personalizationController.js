import PersonalizationModel from "../model/personalization.js";
import addproductmodel from "../model/addproduct.js";

// Get All Personalization Options
export const getPersonalizationOptions = async (req, res) => {
  try {
    const sellerId = req.sellerId; // SECURITY: IDOR fix — never trust req.body.sellerId

    const options = await PersonalizationModel.find({ sellerId });

    // Return flat list as expected by frontend
    res.status(200).json({
      success: true,
      data: options
    });
  } catch (error) {
    console.error("Personalization Options Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Get Gift Wrapping Options
export const getGiftWrappingOptions = async (req, res) => {
  try {
    const { sellerId } = req.body;

    const options = await PersonalizationModel.find({ 
      sellerId, 
      type: "gift_wrapping" 
    });

    res.status(200).json({
      success: true,
      data: {
        options,
        active: options.filter(o => o.isActive).length
      }
    });
  } catch (error) {
    console.error("Gift Wrapping Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Get Greeting Cards
export const getGreetingCards = async (req, res) => {
  try {
    const { sellerId } = req.body;

    const cards = await PersonalizationModel.find({ 
      sellerId, 
      type: "greeting_card" 
    });

    res.status(200).json({
      success: true,
      data: {
        cards,
        active: cards.filter(c => c.isActive).length
      }
    });
  } catch (error) {
    console.error("Greeting Cards Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Get Custom Message Options
export const getCustomMessageOptions = async (req, res) => {
  try {
    const { sellerId } = req.body;

    const options = await PersonalizationModel.find({ 
      sellerId, 
      type: "custom_message" 
    });

    res.status(200).json({
      success: true,
      data: {
        options,
        active: options.filter(o => o.isActive).length
      }
    });
  } catch (error) {
    console.error("Custom Message Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Get Add-on Services
export const getAddOnServices = async (req, res) => {
  try {
    const { sellerId } = req.body;

    const services = await PersonalizationModel.find({ 
      sellerId, 
      type: "add_on_service" 
    });

    res.status(200).json({
      success: true,
      data: {
        services,
        active: services.filter(s => s.isActive).length
      }
    });
  } catch (error) {
    console.error("Add-on Services Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Create Personalization Option
export const createPersonalizationOption = async (req, res) => {
  try {
    const sellerId = req.sellerId; // SECURITY: IDOR fix — never trust req.body.sellerId
    const { type, name, description, price, image, applicableProducts, maxLength, options } = req.body;

    if (!type || !name || price === undefined) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    // Issue #87 fix: Prevent negative prices on personalization options
    if (typeof price !== 'number' || price < 0) {
      return res.status(400).json({ success: false, message: "Price must be a non-negative number" });
    }

    const option = new PersonalizationModel({
      sellerId,
      type,
      name,
      description,
      price,
      image,
      applicableProducts,
      maxLength,
      options
    });

    await option.save();

    res.status(201).json({ success: true, message: "Option created", option });
  } catch (error) {
    console.error("Create Personalization Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Update Personalization Option
export const updatePersonalizationOption = async (req, res) => {
  try {
    const sellerId = req.sellerId; // SECURITY: IDOR fix — never trust req.body.sellerId
    const { optionId, _id, ...updateData } = req.body;
    
    const idToUpdate = optionId || _id;

    const option = await PersonalizationModel.findOne({ _id: idToUpdate, sellerId });
    if (!option) {
      return res.status(404).json({ success: false, message: "Option not found" });
    }

    Object.assign(option, updateData);
    await option.save();

    res.status(200).json({ success: true, message: "Option updated", option });
  } catch (error) {
    console.error("Update Personalization Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Delete Personalization Option
export const deletePersonalizationOption = async (req, res) => {
  try {
    const sellerId = req.sellerId; // SECURITY: IDOR fix — never trust req.body.sellerId
    const { optionId } = req.params;

    const option = await PersonalizationModel.findOneAndDelete({ _id: optionId, sellerId });
    if (!option) {
      return res.status(404).json({ success: false, message: "Option not found" });
    }

    res.status(200).json({ success: true, message: "Option deleted" });
  } catch (error) {
    console.error("Delete Personalization Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Get Pricing Summary for Custom Services
export const getCustomPricing = async (req, res) => {
  try {
    const { sellerId } = req.body;

    const options = await PersonalizationModel.find({ sellerId });
    const products = await addproductmodel.find({ sellerId });

    const pricingSummary = {
      giftWrapping: {
        options: options.filter(o => o.type === "gift_wrapping"),
        avgPrice: 0,
        minPrice: 0,
        maxPrice: 0
      },
      greetingCards: {
        options: options.filter(o => o.type === "greeting_card"),
        avgPrice: 0,
        minPrice: 0,
        maxPrice: 0
      },
      customMessages: {
        options: options.filter(o => o.type === "custom_message"),
        avgPrice: 0,
        minPrice: 0,
        maxPrice: 0
      },
      addOnServices: {
        options: options.filter(o => o.type === "add_on_service"),
        avgPrice: 0,
        minPrice: 0,
        maxPrice: 0
      }
    };

    // Calculate pricing stats for each category
    Object.keys(pricingSummary).forEach(key => {
      const opts = pricingSummary[key].options;
      if (opts.length > 0) {
        const prices = opts.map(o => o.price);
        pricingSummary[key].avgPrice = (prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2);
        pricingSummary[key].minPrice = Math.min(...prices);
        pricingSummary[key].maxPrice = Math.max(...prices);
      }
    });

    res.status(200).json({
      success: true,
      data: {
        pricing: pricingSummary,
        totalProducts: products.length,
        productsWithPersonalization: products.filter(p => 
          options.some(o => o.applicableProducts?.includes(p._id))
        ).length
      }
    });
  } catch (error) {
    console.error("Custom Pricing Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};
