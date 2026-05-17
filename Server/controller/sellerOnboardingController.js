/**
 * Seller Onboarding Controller
 * Handles all seller KYC, document upload, verification, and onboarding functions
 */

import sellermodel from "../model/sellermodel.js";
import { v2 as cloudinary } from 'cloudinary';
import fs from "fs";

// ==================== HELPERS ====================

/**
 * Upload file to Cloudinary
 */
const uploadToCloudinary = async (file, folder = "seller_documents") => {
    try {
        const result = await cloudinary.uploader.upload(file.path, {
            folder: folder,
            resource_type: "auto",
        });

        // Clean up temp file
        if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
        }

        return result.secure_url;
    } catch (error) {
        console.error("Cloudinary upload error:", error);
        throw error;
    }
};

/**
 * Calculate onboarding completion percentage
 */
const calculateCompletionPercentage = (seller) => {
    let score = 0;
    let total = 0;

    // Basic Info (20%)
    total += 20;
    if (seller.name && seller.email && seller.phone && seller.address?.street) {
        score += 20;
    } else {
        if (seller.name) score += 5;
        if (seller.email) score += 5;
        if (seller.phone) score += 5;
        if (seller.address?.street) score += 5;
    }

    // Business Info (15%)
    total += 15;
    if (seller.businessInfo?.businessType && seller.businessInfo?.panNumber) {
        score += 15;
    } else {
        if (seller.businessInfo?.businessType) score += 7;
        if (seller.businessInfo?.panNumber) score += 8;
    }

    // KYC Documents (25%)
    total += 25;
    if (seller.kycDocuments?.panCard?.url) score += 10;
    if (seller.kycDocuments?.aadhaarCard?.url || seller.kycDocuments?.passportOrVoterId?.url) score += 10;
    if (seller.documents?.identityProof?.url) score += 5;

    // Bank Details (20%)
    total += 20;
    if (seller.bankDetails?.accountNumber && seller.bankDetails?.ifscCode && seller.bankDetails?.bankName) {
        score += 20;
    } else {
        if (seller.bankDetails?.accountNumber) score += 7;
        if (seller.bankDetails?.ifscCode) score += 7;
        if (seller.bankDetails?.bankName) score += 6;
    }

    // Declarations (15%)
    total += 15;
    if (seller.declarations?.termsAccepted) score += 5;
    if (seller.declarations?.kycDeclaration) score += 5;
    if (seller.declarations?.antiCounterfeitDeclaration) score += 5;

    // Tax Documents (5%)
    total += 5;
    if (seller.taxDocuments?.tradeLicense?.url || seller.businessInfo?.gstNumber) score += 5;

    return Math.round((score / total) * 100);
};

// ==================== ONBOARDING STEP MANAGEMENT ====================

/**
 * Get current onboarding status
 */
export const getOnboardingStatus = async (req, res) => {
    try {
        const seller = await sellermodel.findById(req.seller._id);

        if (!seller) {
            return res.status(404).json({ success: false, message: "Seller not found" });
        }

        const completionPercentage = calculateCompletionPercentage(seller);

        // Determine required documents based on business type
        const requiredDocuments = getRequiredDocuments(seller.businessInfo?.businessType || 'Individual');

        res.json({
            success: true,
            data: {
                currentStep: seller.onboardingStep || 1,
                completionPercentage,
                onboardingCompleted: seller.onboardingCompleted,
                status: seller.status,
                verificationStatus: seller.verificationStatus,
                businessType: seller.businessInfo?.businessType || 'Individual',
                requiredDocuments,
                stepsCompleted: {
                    basicInfo: !!(seller.name && seller.email && seller.phone),
                    businessInfo: !!(seller.businessInfo?.businessType && seller.businessInfo?.panNumber),
                    kycDocuments: !!(seller.kycDocuments?.panCard?.url),
                    bankDetails: !!(seller.bankDetails?.accountNumber),
                    declarations: !!(seller.declarations?.termsAccepted),
                }
            }
        });
    } catch (error) {
        console.error("Get onboarding status error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

/**
 * Get required documents based on business type
 */
const getRequiredDocuments = (businessType) => {
    const baseDocuments = [
        { key: 'panCard', name: 'PAN Card', required: true },
        { key: 'identityProof', name: 'Identity Proof (Aadhaar/Passport/Voter ID)', required: true },
        { key: 'addressProof', name: 'Address Proof', required: true },
        { key: 'businessLogo', name: 'Business Logo', required: true },
    ];

    const typeSpecificDocuments = {
        'Individual': [],
        'Proprietorship': [
            { key: 'tradeLicense', name: 'Trade License / Shop Establishment', required: false },
        ],
        'Partnership': [
            { key: 'partnershipDeed', name: 'Partnership Deed', required: true },
        ],
        'LLP': [
            { key: 'certificateOfIncorporation', name: 'Certificate of Incorporation', required: true },
            { key: 'llpAgreement', name: 'LLP Agreement', required: true },
        ],
        'Private Limited': [
            { key: 'certificateOfIncorporation', name: 'Certificate of Incorporation', required: true },
            { key: 'moaAoa', name: 'MOA & AOA', required: true },
            { key: 'boardResolution', name: 'Board Resolution', required: true },
        ],
        'Public Limited': [
            { key: 'certificateOfIncorporation', name: 'Certificate of Incorporation', required: true },
            { key: 'moaAoa', name: 'MOA & AOA', required: true },
            { key: 'boardResolution', name: 'Board Resolution', required: true },
        ],
    };

    const optionalDocuments = [
        { key: 'gstCertificate', name: 'GST Certificate', required: false },
        { key: 'msmeUdyamCertificate', name: 'MSME/Udyam Certificate', required: false },
        { key: 'cancelledCheque', name: 'Cancelled Cheque', required: false },
    ];

    return [
        ...baseDocuments,
        ...(typeSpecificDocuments[businessType] || []),
        ...optionalDocuments,
    ];
};

/**
 * Update onboarding step
 */
export const updateOnboardingStep = async (req, res) => {
    try {
        const { step } = req.body;

        if (!step || step < 1 || step > 6) {
            return res.status(400).json({ success: false, message: "Invalid step" });
        }

        const seller = await sellermodel.findByIdAndUpdate(
            req.seller._id,
            { onboardingStep: step },
            { new: true }
        );

        res.json({
            success: true,
            message: "Onboarding step updated",
            currentStep: seller.onboardingStep
        });
    } catch (error) {
        console.error("Update onboarding step error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// ==================== BUSINESS INFO ====================

/**
 * Update business information
 */
export const updateBusinessInfo = async (req, res) => {
    try {
        const {
            businessName,
            tradeName,
            businessType,
            dateOfIncorporation,
            registrationNumber,
            businessAddress,
            businessCity,
            businessState,
            businessPincode,
            panNumber,
            personalPanNumber,
            businessPanNumber,
            gstNumber,
            gstPrincipalPlace,
            msmeNumber,
            udyamNumber,
            cin,
            llpNumber,
        } = req.body;

        const updateData = {
            'businessInfo.businessName': businessName,
            'businessInfo.tradeName': tradeName,
            'businessInfo.businessType': businessType,
            'businessInfo.dateOfIncorporation': dateOfIncorporation,
            'businessInfo.registrationNumber': registrationNumber,
            'businessInfo.businessAddress': businessAddress,
            'businessInfo.businessCity': businessCity,
            'businessInfo.businessState': businessState,
            'businessInfo.businessPincode': businessPincode,
            'businessInfo.panNumber': panNumber,
            'businessInfo.personalPanNumber': personalPanNumber,
            'businessInfo.businessPanNumber': businessPanNumber,
            'businessInfo.gstNumber': gstNumber,
            'businessInfo.gstPrincipalPlace': gstPrincipalPlace,
            'businessInfo.msmeNumber': msmeNumber,
            'businessInfo.udyamNumber': udyamNumber,
            'businessInfo.cin': cin,
            'businessInfo.llpNumber': llpNumber,
        };

        // Remove undefined values
        Object.keys(updateData).forEach(key =>
            updateData[key] === undefined && delete updateData[key]
        );

        const seller = await sellermodel.findByIdAndUpdate(
            req.seller._id,
            { $set: updateData },
            { new: true }
        );

        res.json({
            success: true,
            message: "Business information updated successfully",
            businessInfo: seller.businessInfo
        });
    } catch (error) {
        console.error("Update business info error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

/**
 * Get business information
 */
export const getBusinessInfo = async (req, res) => {
    try {
        const seller = await sellermodel.findById(req.seller._id)
            .select('businessInfo');

        if (!seller) {
            return res.status(404).json({ success: false, message: "Seller not found" });
        }

        res.json({
            success: true,
            businessInfo: seller.businessInfo
        });
    } catch (error) {
        console.error("Get business info error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// ==================== KYC DOCUMENT UPLOADS ====================

/**
 * Upload KYC document
 */
export const uploadKycDocument = async (req, res) => {
    try {
        const { documentType } = req.body;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ success: false, message: "No file uploaded" });
        }

        const validDocTypes = [
            'aadhaarCard', 'panCard', 'passportOrVoterId',
            'partnershipDeed', 'certificateOfIncorporation',
            'moaAoa', 'llpAgreement', 'boardResolution', 'authorizationLetter'
        ];

        if (!validDocTypes.includes(documentType)) {
            return res.status(400).json({ success: false, message: "Invalid document type" });
        }

        const url = await uploadToCloudinary(file, `seller_kyc/${req.seller._id}`);

        const updatePath = `kycDocuments.${documentType}`;
        const update = {
            [`${updatePath}.url`]: url,
            [`${updatePath}.status`]: 'pending_review',
            [`${updatePath}.uploadedAt`]: new Date(),
        };

        const seller = await sellermodel.findByIdAndUpdate(
            req.seller._id,
            { $set: update },
            { new: true }
        );

        // Update verification status to under review
        if (seller.status === 'Pending') {
            await sellermodel.findByIdAndUpdate(req.seller._id, { status: 'UnderReview' });
        }

        res.json({
            success: true,
            message: `${documentType} uploaded successfully`,
            document: seller.kycDocuments[documentType]
        });
    } catch (error) {
        console.error("Upload KYC document error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

/**
 * Upload tax document
 */
export const uploadTaxDocument = async (req, res) => {
    try {
        const { documentType } = req.body;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ success: false, message: "No file uploaded" });
        }

        const validDocTypes = [
            'gstCertificate', 'msmeUdyamCertificate',
            'professionalTaxCertificate', 'shopEstablishmentCertificate', 'tradeLicense'
        ];

        if (!validDocTypes.includes(documentType)) {
            return res.status(400).json({ success: false, message: "Invalid document type" });
        }

        const url = await uploadToCloudinary(file, `seller_tax_docs/${req.seller._id}`);

        const updatePath = `taxDocuments.${documentType}`;
        const update = {
            [`${updatePath}.url`]: url,
            [`${updatePath}.status`]: 'pending_review',
            [`${updatePath}.uploadedAt`]: new Date(),
        };

        const seller = await sellermodel.findByIdAndUpdate(
            req.seller._id,
            { $set: update },
            { new: true }
        );

        res.json({
            success: true,
            message: `${documentType} uploaded successfully`,
            document: seller.taxDocuments[documentType]
        });
    } catch (error) {
        console.error("Upload tax document error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

/**
 * Upload legacy document (for backward compatibility)
 */
export const uploadDocument = async (req, res) => {
    try {
        const { documentType } = req.body;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ success: false, message: "No file uploaded" });
        }

        const validDocTypes = ['identityProof', 'businessLogo', 'tradeLicense', 'gstCertificate', 'addressProof'];

        if (!validDocTypes.includes(documentType)) {
            return res.status(400).json({ success: false, message: "Invalid document type" });
        }

        const url = await uploadToCloudinary(file, `seller_documents/${req.seller._id}`);

        const updatePath = `documents.${documentType}`;
        const update = {
            [`${updatePath}.url`]: url,
            [`${updatePath}.status`]: 'pending_review',
            [`${updatePath}.uploadedAt`]: new Date(),
        };

        const seller = await sellermodel.findByIdAndUpdate(
            req.seller._id,
            { $set: update },
            { new: true }
        );

        res.json({
            success: true,
            message: `${documentType} uploaded successfully`,
            document: seller.documents[documentType]
        });
    } catch (error) {
        console.error("Upload document error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

/**
 * Get all documents status
 */
export const getDocumentsStatus = async (req, res) => {
    try {
        const seller = await sellermodel.findById(req.seller._id)
            .select('kycDocuments taxDocuments documents businessInfo.businessType');

        if (!seller) {
            return res.status(404).json({ success: false, message: "Seller not found" });
        }

        const requiredDocs = getRequiredDocuments(seller.businessInfo?.businessType || 'Individual');

        res.json({
            success: true,
            kycDocuments: seller.kycDocuments,
            taxDocuments: seller.taxDocuments,
            legacyDocuments: seller.documents,
            requiredDocuments: requiredDocs,
        });
    } catch (error) {
        console.error("Get documents status error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// ==================== BANK DETAILS ====================

/**
 * Update bank details
 */
export const updateBankDetails = async (req, res) => {
    try {
        const {
            accountHolderName,
            bankName,
            accountNumber,
            ifscCode,
            branchName,
            upiId,
        } = req.body;

        // Basic validation
        if (!accountHolderName || !bankName || !accountNumber || !ifscCode) {
            return res.status(400).json({
                success: false,
                message: "Account holder name, bank name, account number, and IFSC code are required"
            });
        }

        // IFSC validation (11 characters, first 4 letters, 5th is 0, last 6 alphanumeric)
        const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
        if (!ifscRegex.test(ifscCode.toUpperCase())) {
            return res.status(400).json({ success: false, message: "Invalid IFSC code format" });
        }

        const updateData = {
            'bankDetails.accountHolderName': accountHolderName,
            'bankDetails.bankName': bankName,
            'bankDetails.accountNumber': accountNumber,
            'bankDetails.ifscCode': ifscCode.toUpperCase(),
            'bankDetails.branchName': branchName || '',
            'bankDetails.upiId': upiId || '',
            'bankDetails.isBankVerified': false, // Reset verification on update
        };

        const seller = await sellermodel.findByIdAndUpdate(
            req.seller._id,
            { $set: updateData },
            { new: true }
        );

        res.json({
            success: true,
            message: "Bank details updated successfully",
            bankDetails: {
                accountHolderName: seller.bankDetails.accountHolderName,
                bankName: seller.bankDetails.bankName,
                accountNumber: seller.bankDetails.accountNumber.slice(-4).padStart(seller.bankDetails.accountNumber.length, '*'),
                ifscCode: seller.bankDetails.ifscCode,
                branchName: seller.bankDetails.branchName,
                upiId: seller.bankDetails.upiId,
                isBankVerified: seller.bankDetails.isBankVerified,
            }
        });
    } catch (error) {
        console.error("Update bank details error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

/**
 * Upload cancelled cheque
 */
export const uploadCancelledCheque = async (req, res) => {
    try {
        const file = req.file;

        if (!file) {
            return res.status(400).json({ success: false, message: "No file uploaded" });
        }

        const url = await uploadToCloudinary(file, `seller_bank/${req.seller._id}`);

        const seller = await sellermodel.findByIdAndUpdate(
            req.seller._id,
            {
                $set: {
                    'bankDetails.cancelledChequeUrl': url,
                }
            },
            { new: true }
        );

        res.json({
            success: true,
            message: "Cancelled cheque uploaded successfully",
            cancelledChequeUrl: url
        });
    } catch (error) {
        console.error("Upload cancelled cheque error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

/**
 * Get bank details
 */
export const getBankDetails = async (req, res) => {
    try {
        const seller = await sellermodel.findById(req.seller._id)
            .select('bankDetails');

        if (!seller) {
            return res.status(404).json({ success: false, message: "Seller not found" });
        }

        // Mask account number
        const maskedAccountNumber = seller.bankDetails.accountNumber
            ? seller.bankDetails.accountNumber.slice(-4).padStart(seller.bankDetails.accountNumber.length, '*')
            : '';

        res.json({
            success: true,
            bankDetails: {
                accountHolderName: seller.bankDetails.accountHolderName,
                bankName: seller.bankDetails.bankName,
                accountNumber: maskedAccountNumber,
                ifscCode: seller.bankDetails.ifscCode,
                branchName: seller.bankDetails.branchName,
                upiId: seller.bankDetails.upiId,
                cancelledChequeUrl: seller.bankDetails.cancelledChequeUrl,
                isBankVerified: seller.bankDetails.isBankVerified,
            }
        });
    } catch (error) {
        console.error("Get bank details error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// ==================== DECLARATIONS ====================

/**
 * Accept declarations
 */
export const acceptDeclarations = async (req, res) => {
    try {
        const {
            termsAccepted,
            kycDeclaration,
            antiCounterfeitDeclaration,
            productAuthenticityDeclaration,
            indemnityUndertaking,
            dataUsageConsent,
        } = req.body;

        const now = new Date();
        const ipAddress = req.ip || req.connection.remoteAddress;

        const updateData = {};

        if (termsAccepted !== undefined) {
            updateData['declarations.termsAccepted'] = termsAccepted;
            updateData['declarations.termsAcceptedAt'] = now;
        }

        if (kycDeclaration !== undefined) {
            updateData['declarations.kycDeclaration'] = kycDeclaration;
            updateData['declarations.kycDeclarationAt'] = now;
        }

        if (antiCounterfeitDeclaration !== undefined) {
            updateData['declarations.antiCounterfeitDeclaration'] = antiCounterfeitDeclaration;
            updateData['declarations.antiCounterfeitDeclarationAt'] = now;
        }

        if (productAuthenticityDeclaration !== undefined) {
            updateData['declarations.productAuthenticityDeclaration'] = productAuthenticityDeclaration;
            updateData['declarations.productAuthenticityDeclarationAt'] = now;
        }

        if (indemnityUndertaking !== undefined) {
            updateData['declarations.indemnityUndertaking'] = indemnityUndertaking;
            updateData['declarations.indemnityUndertakingAt'] = now;
        }

        if (dataUsageConsent !== undefined) {
            updateData['declarations.dataUsageConsent'] = dataUsageConsent;
            updateData['declarations.dataUsageConsentAt'] = now;
        }

        // Store IP for legal compliance
        updateData['declarations.eSignIpAddress'] = ipAddress;

        const seller = await sellermodel.findByIdAndUpdate(
            req.seller._id,
            { $set: updateData },
            { new: true }
        );

        // Check if all mandatory declarations are complete
        const allComplete =
            seller.declarations.termsAccepted &&
            seller.declarations.kycDeclaration &&
            seller.declarations.antiCounterfeitDeclaration &&
            seller.declarations.productAuthenticityDeclaration;

        // Update onboarding status if all declarations complete
        if (allComplete && seller.onboardingStep < 5) {
            await sellermodel.findByIdAndUpdate(req.seller._id, {
                onboardingStep: 5,
                onboardingCompleted: true
            });
        }

        res.json({
            success: true,
            message: "Declarations updated successfully",
            declarations: seller.declarations,
            allDeclarationsComplete: allComplete
        });
    } catch (error) {
        console.error("Accept declarations error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

/**
 * Get declarations status
 */
export const getDeclarations = async (req, res) => {
    try {
        const seller = await sellermodel.findById(req.seller._id)
            .select('declarations');

        if (!seller) {
            return res.status(404).json({ success: false, message: "Seller not found" });
        }

        res.json({
            success: true,
            declarations: seller.declarations
        });
    } catch (error) {
        console.error("Get declarations error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// ==================== PARTNER/DIRECTOR DETAILS ====================

/**
 * Add partner details (for Partnership firms)
 */
export const addPartnerDetails = async (req, res) => {
    try {
        const { name, panNumber, aadhaarNumber, designation } = req.body;

        if (!name || !panNumber) {
            return res.status(400).json({
                success: false,
                message: "Partner name and PAN number are required"
            });
        }

        const seller = await sellermodel.findByIdAndUpdate(
            req.seller._id,
            {
                $push: {
                    'kycDocuments.partnerDetails': { name, panNumber, aadhaarNumber, designation }
                }
            },
            { new: true }
        );

        res.json({
            success: true,
            message: "Partner details added successfully",
            partnerDetails: seller.kycDocuments.partnerDetails
        });
    } catch (error) {
        console.error("Add partner details error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

/**
 * Add director details (for Companies/LLPs)
 */
export const addDirectorDetails = async (req, res) => {
    try {
        const { name, din, panNumber, aadhaarNumber, isAuthorizedSignatory } = req.body;

        if (!name || !din || !panNumber) {
            return res.status(400).json({
                success: false,
                message: "Director name, DIN, and PAN number are required"
            });
        }

        const seller = await sellermodel.findByIdAndUpdate(
            req.seller._id,
            {
                $push: {
                    'kycDocuments.directorDetails': { name, din, panNumber, aadhaarNumber, isAuthorizedSignatory }
                }
            },
            { new: true }
        );

        res.json({
            success: true,
            message: "Director details added successfully",
            directorDetails: seller.kycDocuments.directorDetails
        });
    } catch (error) {
        console.error("Add director details error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

/**
 * Remove partner/director
 */
export const removePartnerOrDirector = async (req, res) => {
    try {
        const { type, index } = req.params; // type: 'partner' or 'director'

        if (!['partner', 'director'].includes(type)) {
            return res.status(400).json({ success: false, message: "Invalid type" });
        }

        const field = type === 'partner' ? 'kycDocuments.partnerDetails' : 'kycDocuments.directorDetails';

        const seller = await sellermodel.findById(req.seller._id);
        const array = type === 'partner' ? seller.kycDocuments.partnerDetails : seller.kycDocuments.directorDetails;

        if (index < 0 || index >= array.length) {
            return res.status(400).json({ success: false, message: "Invalid index" });
        }

        array.splice(index, 1);
        await seller.save();

        res.json({
            success: true,
            message: `${type} removed successfully`,
            [type === 'partner' ? 'partnerDetails' : 'directorDetails']: array
        });
    } catch (error) {
        console.error("Remove partner/director error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// ==================== WAREHOUSE MANAGEMENT ====================

/**
 * Add warehouse
 */
export const addWarehouse = async (req, res) => {
    try {
        const { name, address, city, state, pincode, contactPerson, contactPhone, isPrimary } = req.body;

        if (!name || !address || !city || !state || !pincode) {
            return res.status(400).json({ success: false, message: "All address fields are required" });
        }

        // If this is primary, remove primary from others
        if (isPrimary) {
            await sellermodel.findByIdAndUpdate(
                req.seller._id,
                { $set: { 'warehouseDetails.$[].isPrimary': false } }
            );
        }

        const seller = await sellermodel.findByIdAndUpdate(
            req.seller._id,
            {
                $push: {
                    warehouseDetails: { name, address, city, state, pincode, contactPerson, contactPhone, isPrimary }
                }
            },
            { new: true }
        );

        res.json({
            success: true,
            message: "Warehouse added successfully",
            warehouseDetails: seller.warehouseDetails
        });
    } catch (error) {
        console.error("Add warehouse error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

/**
 * Get warehouses
 */
export const getWarehouses = async (req, res) => {
    try {
        const seller = await sellermodel.findById(req.seller._id)
            .select('warehouseDetails');

        res.json({
            success: true,
            warehouseDetails: seller?.warehouseDetails || []
        });
    } catch (error) {
        console.error("Get warehouses error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

/**
 * Remove warehouse
 */
export const removeWarehouse = async (req, res) => {
    try {
        const { index } = req.params;

        const seller = await sellermodel.findById(req.seller._id);

        if (index < 0 || index >= seller.warehouseDetails.length) {
            return res.status(400).json({ success: false, message: "Invalid index" });
        }

        seller.warehouseDetails.splice(index, 1);
        await seller.save();

        res.json({
            success: true,
            message: "Warehouse removed successfully",
            warehouseDetails: seller.warehouseDetails
        });
    } catch (error) {
        console.error("Remove warehouse error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// ==================== BRAND AUTHORIZATION ====================

/**
 * Add brand authorization
 */
export const addBrandAuthorization = async (req, res) => {
    try {
        const { brandName, isOwnBrand, validFrom, validTill } = req.body;

        if (!brandName) {
            return res.status(400).json({ success: false, message: "Brand name is required" });
        }

        const seller = await sellermodel.findByIdAndUpdate(
            req.seller._id,
            {
                $push: {
                    brandAuthorization: { brandName, isOwnBrand, validFrom, validTill }
                }
            },
            { new: true }
        );

        res.json({
            success: true,
            message: "Brand added successfully",
            brandAuthorization: seller.brandAuthorization
        });
    } catch (error) {
        console.error("Add brand authorization error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

/**
 * Upload brand document
 */
export const uploadBrandDocument = async (req, res) => {
    try {
        const { brandIndex, documentType } = req.body; // documentType: authorizationLetter, trademarkCertificate, distributorInvoice
        const file = req.file;

        if (!file) {
            return res.status(400).json({ success: false, message: "No file uploaded" });
        }

        const validDocTypes = ['authorizationLetter', 'trademarkCertificate', 'distributorInvoice'];
        if (!validDocTypes.includes(documentType)) {
            return res.status(400).json({ success: false, message: "Invalid document type" });
        }

        const seller = await sellermodel.findById(req.seller._id);
        if (!seller.brandAuthorization[brandIndex]) {
            return res.status(400).json({ success: false, message: "Brand not found" });
        }

        const url = await uploadToCloudinary(file, `seller_brands/${req.seller._id}`);

        seller.brandAuthorization[brandIndex][documentType] = {
            url,
            status: 'pending_review',
            uploadedAt: new Date()
        };

        await seller.save();

        res.json({
            success: true,
            message: "Brand document uploaded successfully",
            brandAuthorization: seller.brandAuthorization
        });
    } catch (error) {
        console.error("Upload brand document error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// ==================== REGULATED LICENSES ====================

/**
 * Update regulated license
 */
export const updateRegulatedLicense = async (req, res) => {
    try {
        const { licenseType, licenseNumber, validTill } = req.body;

        const validTypes = ['fssaiLicense', 'drugLicense', 'bisCertificate', 'iecCode', 'legalMetrologyCertificate'];
        if (!validTypes.includes(licenseType)) {
            return res.status(400).json({ success: false, message: "Invalid license type" });
        }

        const updateData = {};

        if (licenseType === 'iecCode') {
            updateData[`regulatedLicenses.${licenseType}.code`] = licenseNumber;
        } else {
            updateData[`regulatedLicenses.${licenseType}.licenseNumber`] = licenseNumber;
            if (validTill) {
                updateData[`regulatedLicenses.${licenseType}.validTill`] = validTill;
            }
        }

        const seller = await sellermodel.findByIdAndUpdate(
            req.seller._id,
            { $set: updateData },
            { new: true }
        );

        res.json({
            success: true,
            message: "License updated successfully",
            regulatedLicenses: seller.regulatedLicenses
        });
    } catch (error) {
        console.error("Update regulated license error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

/**
 * Upload regulated license document
 */
export const uploadRegulatedLicenseDocument = async (req, res) => {
    try {
        const { licenseType } = req.body;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ success: false, message: "No file uploaded" });
        }

        const validTypes = ['fssaiLicense', 'drugLicense', 'bisCertificate', 'iecCode', 'legalMetrologyCertificate'];
        if (!validTypes.includes(licenseType)) {
            return res.status(400).json({ success: false, message: "Invalid license type" });
        }

        const url = await uploadToCloudinary(file, `seller_licenses/${req.seller._id}`);

        const updateData = {
            [`regulatedLicenses.${licenseType}.document.url`]: url,
            [`regulatedLicenses.${licenseType}.document.status`]: 'pending_review',
            [`regulatedLicenses.${licenseType}.document.uploadedAt`]: new Date(),
        };

        const seller = await sellermodel.findByIdAndUpdate(
            req.seller._id,
            { $set: updateData },
            { new: true }
        );

        res.json({
            success: true,
            message: "License document uploaded successfully",
            regulatedLicenses: seller.regulatedLicenses
        });
    } catch (error) {
        console.error("Upload regulated license document error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

/**
 * Get all regulated licenses
 */
export const getRegulatedLicenses = async (req, res) => {
    try {
        const seller = await sellermodel.findById(req.seller._id)
            .select('regulatedLicenses');

        res.json({
            success: true,
            regulatedLicenses: seller?.regulatedLicenses || {}
        });
    } catch (error) {
        console.error("Get regulated licenses error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// ==================== COMPLETE ONBOARDING ====================

/**
 * Mark onboarding as complete
 */
export const completeOnboarding = async (req, res) => {
    try {
        const seller = await sellermodel.findById(req.seller._id);

        // Validation checks
        const errors = [];

        if (!seller.businessInfo?.panNumber) {
            errors.push("PAN number is required");
        }

        if (!seller.bankDetails?.accountNumber || !seller.bankDetails?.ifscCode) {
            errors.push("Bank details are required");
        }

        if (!seller.declarations?.termsAccepted) {
            errors.push("Terms must be accepted");
        }

        if (!seller.declarations?.kycDeclaration) {
            errors.push("KYC declaration is required");
        }

        if (errors.length > 0) {
            return res.status(400).json({
                success: false,
                message: "Please complete all required steps",
                errors
            });
        }

        const completionPercentage = calculateCompletionPercentage(seller);

        await sellermodel.findByIdAndUpdate(
            req.seller._id,
            {
                onboardingCompleted: true,
                onboardingStep: 5,
                status: 'UnderReview',
                'verificationStatus.completionPercentage': completionPercentage
            }
        );

        res.json({
            success: true,
            message: "Onboarding completed! Your account is now under review.",
            completionPercentage
        });
    } catch (error) {
        console.error("Complete onboarding error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

/**
 * Get complete onboarding data
 */
export const getCompleteOnboardingData = async (req, res) => {
    try {
        const seller = await sellermodel.findById(req.seller._id)
            .select('-password -otp -otpExpire -resetOtp -resetOtpExpire');

        if (!seller) {
            return res.status(404).json({ success: false, message: "Seller not found" });
        }

        const completionPercentage = calculateCompletionPercentage(seller);
        const requiredDocuments = getRequiredDocuments(seller.businessInfo?.businessType || 'Individual');

        res.json({
            success: true,
            seller,
            completionPercentage,
            requiredDocuments
        });
    } catch (error) {
        console.error("Get complete onboarding data error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

export const removeDocument = async (req, res) => {
    try {
        const { category, documentType } = req.params;

        const validCategories = ['kycDocuments', 'taxDocuments', 'documents'];
        if (!validCategories.includes(category)) {
            return res.status(400).json({ success: false, message: "Invalid category" });
        }

        const update = {
            [`${category}.${documentType}`]: {
                url: '',
                status: 'pending',
                uploadedAt: null,
                rejectionReason: ''
            }
        };

        await sellermodel.findByIdAndUpdate(req.seller._id, { $set: update });

        res.json({
            success: true,
            message: "Document removed successfully"
        });
    } catch (error) {
        console.error("Remove document error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

export const getBasicSellerProfile = async (req, res) => {
  try {
    const seller = await sellermodel.findById(req.seller._id).select(
      "name email phone alternatePhone address contactPerson"
    );

    res.json({
      success: true,
      seller: {
        name: seller.name || "",
        email: seller.email || "",
        phone: seller.phone || "",
        alternatePhone: seller.alternatePhone || "",
        address: {
          street: seller.address?.street || "",
          city: seller.address?.city || "",
          state: seller.address?.state || "",
          pincode: seller.address?.pincode || "",
        },
        contactPerson: {
          name: seller.contactPerson?.name || "",
          designation: seller.contactPerson?.designation || "",
          phone: seller.contactPerson?.phone || "",
          email: seller.contactPerson?.email || "",
        },
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const updateBasicSellerProfile = async (req, res) => {
  try {
    const {
      name,
      phone,
      alternatePhone,
      street,
      city,
      state,
      pincode,
      contactPersonName,
      contactPersonDesignation,
      contactPersonPhone,
      contactPersonEmail,
    } = req.body;

    const seller = await sellermodel.findByIdAndUpdate(
      req.seller._id,
      {
        $set: {
          name,
          phone,
          alternatePhone,

          "address.street": street,
          "address.city": city,
          "address.state": state,
          "address.pincode": pincode,

          "contactPerson.name": contactPersonName,
          "contactPerson.designation": contactPersonDesignation,
          "contactPerson.phone": contactPersonPhone,
          "contactPerson.email": contactPersonEmail,
        },
      },
      { new: true }
    );

    res.json({ success: true, seller });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Update failed" });
  }
};


/**
 * Get full seller business information
 * Returns ALL businessInfo fields filled during onboarding
 */
// controller/sellerOnboardingController.js
export const getSellerBusinessDetails = async (req, res) => {
  try {
    const seller = await sellermodel.findById(req.seller._id).select(
      "businessInfo documents status onboardingCompleted verificationStatus"
    );

    if (!seller) {
      return res.status(404).json({ success: false, message: "Seller not found" });
    }

    const bi = seller.businessInfo || {};
    const type = bi.businessType || "Individual";

    // Base fields (always safe)
    const businessInfo = {
      businessType: type,
      businessName: bi.businessName || "",
      tradeName: bi.tradeName || "",
      ownerName: bi.ownerName || "",

      businessAddress: bi.businessAddress || "",
      businessCity: bi.businessCity || "",
      businessState: bi.businessState || "",
      businessPincode: bi.businessPincode || "",

      panNumber: bi.panNumber || "",
      personalPanNumber: bi.personalPanNumber || "",
      businessPanNumber: bi.businessPanNumber || "",

      gstNumber: bi.gstNumber || "",
      gstPrincipalPlace: bi.gstPrincipalPlace || "",

      msmeNumber: bi.msmeNumber || "",
      udyamNumber: bi.udyamNumber || "",

      // ✅ LOGO FROM KYC
      logo: seller.documents?.businessLogo?.url || "",
    };

    // Business-type specific (ONLY IF EXISTS)
    if (["LLP", "Private Limited", "Public Limited"].includes(type)) {
      businessInfo.dateOfIncorporation = bi.dateOfIncorporation || "";
    }

    if (type === "LLP") {
      businessInfo.llpNumber = bi.llpNumber || "";
    }

    if (["Private Limited", "Public Limited"].includes(type)) {
      businessInfo.cin = bi.cin || "";
    }

    if (type === "Partnership") {
      businessInfo.registrationNumber = bi.registrationNumber || "";
    }

    res.json({
      success: true,
      businessInfo,
      sellerStatus: seller.status,
      verificationStatus: seller.verificationStatus,
      onboardingCompleted: seller.onboardingCompleted,
    });
  } catch (error) {
    console.error("Get seller business details error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Get ALL seller documents (KYC + TAX + GENERAL)
export const getSellerAllDocuments = async (req, res) => {
  try {
    const seller = await sellermodel.findById(req.seller._id).select(
      "kycDocuments taxDocuments documents businessInfo.businessType"
    );

    if (!seller) {
      return res.status(404).json({
        success: false,
        message: "Seller not found",
      });
    }

    res.json({
      success: true,
      documents: {
        kyc: seller.kycDocuments || {},
        tax: seller.taxDocuments || {},
        general: seller.documents || {},
      },
      businessType: seller.businessInfo?.businessType || "Individual",
    });
  } catch (error) {
    console.error("Get seller documents error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
export const updateSellerBusinessDetails = async (req, res) => {
  try {
    const seller = await sellermodel.findById(req.seller._id);
    if (!seller) {
      return res.status(404).json({ success: false, message: "Seller not found" });
    }

    const bi = seller.businessInfo;
    const type = req.body.businessType ?? bi.businessType;

    // ===== COMMON =====
    bi.businessType = type;
    bi.businessName = req.body.businessName ?? bi.businessName;
    bi.tradeName = req.body.tradeName ?? bi.tradeName;

    bi.businessAddress = req.body.businessAddress ?? bi.businessAddress;
    bi.businessCity = req.body.businessCity ?? bi.businessCity;
    bi.businessState = req.body.businessState ?? bi.businessState;
    bi.businessPincode = req.body.businessPincode ?? bi.businessPincode;

    bi.panNumber = req.body.panNumber ?? bi.panNumber;
    bi.personalPanNumber = req.body.personalPanNumber ?? bi.personalPanNumber;
    bi.businessPanNumber = req.body.businessPanNumber ?? bi.businessPanNumber;

    bi.gstNumber = req.body.gstNumber ?? bi.gstNumber;
    bi.gstPrincipalPlace = req.body.gstPrincipalPlace ?? bi.gstPrincipalPlace;

    bi.msmeNumber = req.body.msmeNumber ?? bi.msmeNumber;
    bi.udyamNumber = req.body.udyamNumber ?? bi.udyamNumber;

    // ===== TYPE SPECIFIC =====
    if (["LLP", "Private Limited", "Public Limited"].includes(type)) {
      bi.dateOfIncorporation = req.body.dateOfIncorporation ?? bi.dateOfIncorporation;
    }

    if (type === "LLP") {
      bi.llpNumber = req.body.llpNumber ?? bi.llpNumber;
      bi.cin = undefined;
    }

    if (["Private Limited", "Public Limited"].includes(type)) {
      bi.cin = req.body.cin ?? bi.cin;
      bi.llpNumber = undefined;
    }

    if (type === "Partnership") {
      bi.registrationNumber = req.body.registrationNumber ?? bi.registrationNumber;
    }

    await seller.save();

    res.json({
      success: true,
      message: "Business details updated successfully",
      businessInfo: bi,
    });
  } catch (error) {
    console.error("Update business info error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
