import mongoose from "mongoose";

const addproductSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },

  categoryname: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Category",
    required: true,
  },
  subcategory: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Subcategory",
    required: true,
  },

  price: { type: Number, required: true },
  oldprice: { type: Number, required: true },
  discount: { type: Number, required: true },

  ingredients: String,
  brand: String,
  size: String,
  additional_details: String,



  // ⭐ Extra Product Specification Fields
  productDimensions: { type: String },    // "30 x 10 x 3 cm"
  itemWeight: { type: String },           // "300 g"
  itemDimensionsLxWxH: { type: String },  // "30 x 10 x 3 Centimeters"
  netQuantity: { type: String, default: "1 Count" },
  genericName: { type: String },
  gngId: { type: String },                // GNG unique product identifier
  itemPartNumber: { type: String },
  dateFirstAvailable: { type: Date },
  manufacturer: { type: String },
  packer: { type: String },
  department: { type: String },
  countryOfOrigin: { type: String, default: "India" },
  bestSellerRank: { type: String },

  // ⭐ HSN & Compliance Fields (For GST)
  hsnCode: { type: String, default: '' }, // Harmonized System Nomenclature - Required for GST
  gstRate: { type: Number, default: 18 }, // GST percentage (0, 5, 12, 18, 28)

  // ⭐ Minimum Order Quantity
  moq: { type: Number, default: 1 }, // Minimum Order Quantity
  // ⭐ Dynamic Category Attributes
  attributes: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  // ⭐ Brand Authorization (if selling branded products)
  isBrandedProduct: { type: Boolean, default: false },
  brandAuthorizationRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller.brandAuthorization' },

  // ⭐ Regulated Category Compliance
  fssaiRequired: { type: Boolean, default: false },
  fssaiLicenseNumber: { type: String, default: '' },
  bisRequired: { type: Boolean, default: false },
  bisCertificateNumber: { type: String, default: '' },
  drugLicenseRequired: { type: Boolean, default: false },
  drugLicenseNumber: { type: String, default: '' },

  // ⭐ Importer Details (for imported products)
  isImported: { type: Boolean, default: false },
  importerName: { type: String, default: '' },
  importerAddress: { type: String, default: '' },

  // ⭐ Newly Added Fields
  materialComposition: { type: String },     // "80% woolen 20% spandex"
  outerMaterial: { type: String },           // "Wool"
  length: { type: String },                  // "Calf length"
  careInstructions: { type: String },        // "Do not Iron or Bleach..."
  aboutThisItem: { type: String },           // Long description or bullet points

  // ⭐ State & Occasion Fields (For Regional Handicrafts)
  state: { type: String, default: '' },      // Origin state (e.g., "Tripura", "Assam", "Meghalaya")
  occasions: [{                               // Applicable occasions
    type: String,
    enum: [
      'Diwali', 'Holi', 'Durga Puja', 'Bihu', 'Christmas', 'Eid',
      'Wedding', 'Anniversary', 'Birthday', 'Housewarming',
      'Corporate Gifting', 'Festive Season', 'Daily Use', 'Home Decor',
      'Puja', 'Traditional Ceremony', 'New Year', 'Employee Recognition',
      'Client Appreciation', 'Farewell', 'Baby Shower', 'Other'
    ]
  }],

  // ⭐ Relationship-Based Gifting (Gift For Whom)
  giftFor: [{
    type: String,
    enum: [
      'Brother', 'Sister', 'Mother', 'Father', 'Wife', 'Husband',
      'Son', 'Daughter', 'Grandfather', 'Grandmother', 'Uncle', 'Aunt',
      'Friend', 'Best Friend', 'Boyfriend', 'Girlfriend', 'Boss', 'Colleague',
      'Teacher', 'Kids', 'Teens', 'Men', 'Women', 'Couples', 'Parents',
      'In-Laws', 'Newlyweds', 'New Parents', 'Pet Lovers', 'Anyone'
    ]
  }],

  // ⭐ B2B Corporate Gifting Fields
  // Bulk Pricing Tiers (discounted prices for larger quantities)
  bulkPricing: {
    tier25: { type: Number },   // Price for 25-49 units
    tier50: { type: Number },   // Price for 50-99 units (10% off)
    tier100: { type: Number },  // Price for 100-499 units (15% off)
    tier500: { type: Number }   // Price for 500+ units (20% off)
  },

  // Customization Options
  customizationAvailable: {
    logo: { type: Boolean, default: false },     // Company logo printing
    message: { type: Boolean, default: true },   // Custom message card
    packaging: { type: Boolean, default: true }  // Premium gift packaging
  },
  logoMinQuantity: { type: Number, default: 25 }, // Minimum qty for logo printing

  // Target Recipients (for filtering)
  recipientTypes: [{
    type: String,
    enum: ['Employees', 'Clients', 'VIP Clients', 'Partners', 'Vendors', 'Team', 'Family', 'Friends', 'Everyone']
  }],

  // "Perfect For" tags (displayed on product card)
  perfectFor: [{ type: String }],

  // Contents (for hampers/gift boxes)
  contents: [{ type: String }],

  // Product Type
  productType: {
    type: String,
    enum: ['Hamper', 'Single Item', 'Gift Set', 'Combo', 'Subscription Box'],
    default: 'Single Item'
  },

  // Rating & Reviews
  rating: { type: Number, default: 0, min: 0, max: 5 },
  reviewCount: { type: Number, default: 0 },

  // Delivery Time
  deliveryDays: { type: String, default: '5-7 days' },

  // SEO
  metaTitle: { type: String },
  metaDescription: { type: String },
  tags: [{ type: String }],

  approved: { type: Boolean, default: false },

  images: [
    {
      url: { type: String, required: true },
      altText: { type: String, default: "" },
    },
  ],

  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Seller",
    required: true
  },

  // ⭐ Stock Fields
  stock: { type: Number, required: true, default: 0 },

  // SECURITY: Reserved stock for pending payments (prevents overselling)
  reservedStock: { type: Number, default: 0 },

  // Track individual reservations for timeout cleanup
  reservations: [{
    razorpayOrderId: String,
    userId: String,
    quantity: Number,
    createdAt: { type: Date, default: Date.now },
    expiresAt: Date
  }],

  availability: {
    type: String,
    enum: ["In Stock", "Low Stock", "Out of Stock"],
    default: "In Stock",
  },

  isAvailable: { type: Boolean, default: true },
  isFeatured: { type: Boolean, default: false },

  // ⭐ Homepage Collection Visibility (Admin-controlled)
  showInBestOfNorthEast: { type: Boolean, default: false },  // "Best of North East" section
  showInUnder999: { type: Boolean, default: false }           // "Perfect Gifts Under ₹999" section


}, { timestamps: true });

// ⭐ Auto-update availability before saving
// SECURITY: Considers both stock and reservedStock
addproductSchema.pre("save", function (next) {
  this.stock = parseInt(this.stock) || 0;
  this.reservedStock = parseInt(this.reservedStock) || 0;

  // Available stock = total stock - reserved stock
  const availableStock = this.stock - this.reservedStock;

  this.isAvailable = availableStock > 0;

  if (availableStock <= 0) {
    if (this.stock <= 0) this.stock = 0;
    this.availability = "Out of Stock";
  }
  else if (availableStock < 5) {
    this.availability = "Low Stock";
  }
  else {
    this.availability = "In Stock";
  }

  next();
});

// ⭐ Performance Tuning: Add indexes for frequently queried fields
addproductSchema.index({ sellerId: 1 });
addproductSchema.index({ categoryname: 1, subcategory: 1 });
addproductSchema.index({ approved: 1, isAvailable: 1 });
addproductSchema.index({ price: 1 });
// Text index for search functionality
addproductSchema.index({ title: 'text', description: 'text', brand: 'text' });

const addproductmodel = mongoose.model("Product", addproductSchema);
export default addproductmodel;
