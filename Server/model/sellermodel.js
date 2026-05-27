import mongoose from "mongoose";

// ==================== DOCUMENT STATUS ENUM ====================
const documentStatusEnum = ['pending', 'pending_review', 'verified', 'rejected'];

// ==================== DOCUMENT SCHEMA (Reusable) ====================
const documentSchema = {
  url: { type: String, default: '' },
  status: { type: String, enum: documentStatusEnum, default: 'pending' },
  uploadedAt: { type: Date },
  reviewedAt: { type: Date },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  rejectionReason: { type: String, default: '' }
};

const sellerschema = new mongoose.Schema({
  uniqueId: { type: String, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  nickName: { type: String, required: true }, // Trade Name / Brand Name

  otp: { type: String },
  otpExpire: { type: Date },
  verified: { type: Boolean, default: false },

  // Password reset fields
  resetOtp: { type: String },
  resetOtpExpire: { type: Date },

  // Account blocking (security feature)
  isBlocked: { type: Boolean, default: false },
  blockedAt: { type: Date },
  blockReason: { type: String },

  // Session Revocation: All tokens issued before this timestamp are rejected
  tokenInvalidatedBefore: { type: Date, default: null },

  phone: Number,
  alternatePhone: { type: Number },

  // ==================== REGISTERED ADDRESS ====================
  address: {
    street: String,
    city: String,
    state: String,
    pincode: String,
  },

  // ==================== COMMUNICATION ADDRESS ====================
  communicationAddress: {
    sameAsRegistered: { type: Boolean, default: true },
    street: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    pincode: { type: String, default: '' },
  },

  // ==================== CONTACT PERSON ====================
  contactPerson: {
    name: { type: String, default: '' },
    designation: { type: String, default: '' },
    phone: { type: String, default: '' },
    email: { type: String, default: '' },
  },

  image: String, // Owner Passport Photo
  date: { type: Date, default: Date.now },
  lastLogin: { type: Date },
  lastProductPostedAt: { type: Date },
  inactiveSince: { type: Date },
  inactiveNotificationSentAt: { type: Date },
  region: { type: String },
  approved: { type: Boolean, default: false },
  holidayMode: { type: Boolean, default: false },
  about: { type: String, default: '' },

  // ==================== ONBOARDING STATUS ====================
  onboardingStep: { type: Number, default: 1 }, // 1-5 for wizard steps
  onboardingCompleted: { type: Boolean, default: false },

  status: {
    type: String,
    enum: ['Pending', 'UnderReview', 'PartiallyVerified', 'Active', 'Suspended'],
    default: 'Pending'
  },
  commissionRate: { type: Number, default: 5 },

  // ==================== BUSINESS INFORMATION ====================
  businessInfo: {
    ownerName: { type: String, default: '' },
    businessName: { type: String, default: '' },
    tradeName: { type: String, default: '' }, // If different from business name
    businessType: {
      type: String,
      enum: ['Individual', 'Proprietorship', 'Partnership', 'LLP', 'Private Limited', 'Public Limited'],
      default: 'Individual'
    },
    dateOfIncorporation: { type: Date },
    registrationNumber: { type: String, default: '' },

    // Business Address (Principal Place of Business)
    businessAddress: { type: String, default: '' },
    businessCity: { type: String, default: '' },
    businessState: { type: String, default: '' },
    businessPincode: { type: String, default: '' },
    businessCountry: { type: String, default: 'India' },

    // PAN Details
    panNumber: { type: String, default: '' }, // Main PAN (Mandatory)
    personalPanNumber: { type: String, default: '' }, // Owner's personal PAN
    businessPanNumber: { type: String, default: '' }, // Business PAN (for companies)

    // GST Details
    gstNumber: { type: String, default: '' },
    gstPrincipalPlace: { type: String, default: '' },
    gstGracePeriodEnd: { type: Date }, // 3 months from first sale or ₹50,000

    // MSME / Udyam Registration
    msmeNumber: { type: String, default: '' },
    udyamNumber: { type: String, default: '' },

    // Professional Tax
    professionalTaxNumber: { type: String, default: '' },

    // For Companies/LLPs
    cin: { type: String, default: '' }, // Corporate Identification Number
    llpNumber: { type: String, default: '' },
  },

  // ==================== KYC DOCUMENTS ====================
  kycDocuments: {
    // Individual / Proprietor Documents
    aadhaarCard: { ...documentSchema },
    panCard: { ...documentSchema },
    passportOrVoterId: { ...documentSchema }, // Passport / Voter ID / Driving Licence

    // Partnership Documents
    partnershipDeed: { ...documentSchema },
    partnerDetails: [{
      name: String,
      panNumber: String,
      aadhaarNumber: String,
      designation: String
    }],

    // Company / LLP Documents
    certificateOfIncorporation: { ...documentSchema },
    moaAoa: { ...documentSchema }, // Memorandum & Articles of Association
    llpAgreement: { ...documentSchema },
    boardResolution: { ...documentSchema },
    authorizationLetter: { ...documentSchema },
    directorDetails: [{
      name: String,
      din: String, // Director Identification Number
      panNumber: String,
      aadhaarNumber: String,
      isAuthorizedSignatory: { type: Boolean, default: false }
    }],
  },

  // ==================== TAX & STATUTORY DOCUMENTS ====================
  taxDocuments: {
    gstCertificate: { ...documentSchema },
    msmeUdyamCertificate: { ...documentSchema },
    professionalTaxCertificate: { ...documentSchema },
    shopEstablishmentCertificate: { ...documentSchema },
    tradeLicense: { ...documentSchema },
  },

  // ==================== BANK DETAILS ====================
  bankDetails: {
    accountHolderName: { type: String, default: '' },
    bankName: { type: String, default: '' },
    accountNumber: { type: String, default: '' },
    ifscCode: { type: String, default: '' },
    branchName: { type: String, default: '' },
    upiId: { type: String, default: '' },
    cancelledChequeUrl: { type: String, default: '' },
    bankPassbookUrl: { type: String, default: '' },
    isBankVerified: { type: Boolean, default: false },
    pennyDropVerified: { type: Boolean, default: false },
    pennyDropTransactionId: { type: String, default: '' },
    verifiedAt: { type: Date },
  },

  // ==================== LEGACY DOCUMENTS (Backward Compatibility) ====================
  documents: {
    identityProof: { ...documentSchema },
    businessLogo: { ...documentSchema },
    tradeLicense: { ...documentSchema },
    gstCertificate: { ...documentSchema },
    addressProof: { ...documentSchema },
    gst: { type: String, default: '' },
    pan: { type: String, default: '' },
    isVerified: { type: Boolean, default: false }
  },

  // ==================== PRODUCT & BUSINESS DETAILS ====================
  productInfo: {
    categories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
    primaryCategory: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
    brandNames: [{ type: String }],
    sellerType: {
      type: String,
      enum: ['Manufacturer', 'Trader', 'Importer', 'Reseller'],
      default: 'Trader'
    },
    productSourceDetails: { type: String, default: '' },
    defaultHsnCode: { type: String, default: '' },
    minimumOrderQuantity: { type: Number, default: 1 },
  },

  // ==================== BRAND AUTHORIZATION ====================
  brandAuthorization: [{
    brandName: { type: String },
    authorizationLetter: { ...documentSchema },
    trademarkCertificate: { ...documentSchema },
    distributorInvoice: { ...documentSchema },
    isOwnBrand: { type: Boolean, default: false },
    validFrom: { type: Date },
    validTill: { type: Date },
  }],

  // ==================== WAREHOUSE & LOGISTICS ====================
  warehouseDetails: [{
    name: { type: String },
    address: { type: String },
    city: { type: String },
    state: { type: String },
    pincode: { type: String },
    contactPerson: { type: String },
    contactPhone: { type: String },
    isPrimary: { type: Boolean, default: false },
  }],

  // ==================== LOGISTICS PREFERENCES ====================
  logisticsPreferences: {
    preferredShippingModel: {
      type: String,
      enum: ['Seller Fulfilled', 'Platform Fulfilled', 'Hybrid'],
      default: 'Seller Fulfilled'
    },
    pickupContactName: { type: String, default: '' },
    pickupContactPhone: { type: String, default: '' },
  },

  // ==================== COMPLIANCE & DECLARATIONS ====================
  declarations: {
    termsAccepted: { type: Boolean, default: false },
    termsAcceptedAt: { type: Date },
    termsVersion: { type: String, default: '1.0' },

    kycDeclaration: { type: Boolean, default: false },
    kycDeclarationAt: { type: Date },

    antiCounterfeitDeclaration: { type: Boolean, default: false },
    antiCounterfeitDeclarationAt: { type: Date },

    productAuthenticityDeclaration: { type: Boolean, default: false },
    productAuthenticityDeclarationAt: { type: Date },

    indemnityUndertaking: { type: Boolean, default: false },
    indemnityUndertakingAt: { type: Date },

    dataUsageConsent: { type: Boolean, default: false },
    dataUsageConsentAt: { type: Date },

    // E-Signature
    eSignatureUrl: { type: String, default: '' },
    eSignedAt: { type: Date },
    eSignIpAddress: { type: String, default: '' },
  },

  // ==================== REGULATED CATEGORY LICENSES ====================
  regulatedLicenses: {
    // Food Items
    fssaiLicense: {
      licenseNumber: { type: String, default: '' },
      document: { ...documentSchema },
      validTill: { type: Date },
    },

    // Pharma
    drugLicense: {
      licenseNumber: { type: String, default: '' },
      document: { ...documentSchema },
      validTill: { type: Date },
    },

    // Standards
    bisCertificate: {
      certificateNumber: { type: String, default: '' },
      document: { ...documentSchema },
      validTill: { type: Date },
    },

    // Import/Export
    iecCode: {
      code: { type: String, default: '' },
      document: { ...documentSchema },
    },

    // Legal Metrology
    legalMetrologyCertificate: {
      certificateNumber: { type: String, default: '' },
      document: { ...documentSchema },
      validTill: { type: Date },
    },
  },

  // ==================== VERIFICATION STATUS ====================
  verificationStatus: {
    isFullyVerified: { type: Boolean, default: false },
    verifiedAt: { type: Date },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    rejectionReason: { type: String, default: '' },
    completionPercentage: { type: Number, default: 0 },

    // Individual verification flags
    basicInfoVerified: { type: Boolean, default: false },
    kycVerified: { type: Boolean, default: false },
    taxDocsVerified: { type: Boolean, default: false },
    bankVerified: { type: Boolean, default: false },
    declarationsComplete: { type: Boolean, default: false },

    // API Verification Results
    panVerified: { type: Boolean, default: false },
    panVerifiedAt: { type: Date },
    gstVerified: { type: Boolean, default: false },
    gstVerifiedAt: { type: Date },
    aadhaarVerified: { type: Boolean, default: false },
    aadhaarVerifiedAt: { type: Date },
  },

  // ==================== GST FINANCIAL BREAKDOWN ====================
  gstDetails: {
    gstPenalty: { type: Number, default: 0 },
    gstPayout: { type: Number, default: 0 },
    gstPendingPayout: { type: Number, default: 0 },
    gstTotalWithdrawCredited: { type: Number, default: 0 },
    gstBreakpointDebit: { type: Number, default: 0 },
    totalSalesAmount: { type: Number, default: 0 }, // Track for GST threshold
    firstSuccessfulOrderAt: { type: Date }, // Track for GST grace period
  },
}, { timestamps: true });

// ==================== PRE-SAVE MIDDLEWARE ====================
sellerschema.pre('save', function (next) {
  // Calculate completion percentage
  let completionScore = 0;
  let totalFields = 0;

  // Basic Info (20%)
  totalFields += 5;
  if (this.name) completionScore += 1;
  if (this.email) completionScore += 1;
  if (this.phone) completionScore += 1;
  if (this.address?.street) completionScore += 1;
  if (this.businessInfo?.businessType) completionScore += 1;

  // KYC Documents (30%)
  totalFields += 3;
  if (this.kycDocuments?.panCard?.url) completionScore += 1;
  if (this.kycDocuments?.aadhaarCard?.url || this.kycDocuments?.passportOrVoterId?.url) completionScore += 1;
  if (this.businessInfo?.panNumber) completionScore += 1;

  // Bank Details (20%)
  totalFields += 4;
  if (this.bankDetails?.accountNumber) completionScore += 1;
  if (this.bankDetails?.ifscCode) completionScore += 1;
  if (this.bankDetails?.bankName) completionScore += 1;
  if (this.bankDetails?.accountHolderName) completionScore += 1;

  // Declarations (20%)
  totalFields += 3;
  if (this.declarations?.termsAccepted) completionScore += 1;
  if (this.declarations?.kycDeclaration) completionScore += 1;
  if (this.declarations?.antiCounterfeitDeclaration) completionScore += 1;

  // Tax Documents (10%)
  totalFields += 1;
  if (this.taxDocuments?.tradeLicense?.url || this.businessInfo?.gstNumber) completionScore += 1;

  this.verificationStatus.completionPercentage = Math.round((completionScore / totalFields) * 100);

  // Check if all declarations are complete
  this.verificationStatus.declarationsComplete =
    this.declarations?.termsAccepted &&
    this.declarations?.kycDeclaration &&
    this.declarations?.antiCounterfeitDeclaration &&
    this.declarations?.productAuthenticityDeclaration;

  next();
});

// ==================== VIRTUAL FOR FULL NAME ====================
sellerschema.virtual('displayName').get(function () {
  return this.businessInfo?.businessName || this.nickName || this.name;
});

const sellermodel = mongoose.models.seller || mongoose.model("Seller", sellerschema);

export default sellermodel;