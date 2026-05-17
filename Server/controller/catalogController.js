/**
 * Catalog Management Controller
 * Admin CRUD operations for:
 * - Categories & Subcategories
 * - Occasions (Shop by Occasion)
 * - States (Shop by State)
 * - GiftFor Relations (Shop by Relation)
 */
import Category from '../model/Category.js';
import Subcategory from '../model/Subcategory.js';
import Occasion from '../model/Occasion.js';
import State from '../model/State.js';
import GiftFor from '../model/GiftFor.js';
import Product from '../model/addproduct.js';
import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import { escapeRegex } from '../utils/errorHandler.js';

// ============================================
// OCCASION MANAGEMENT
// ============================================

// Get all occasions (admin view with all details)
export const getAllOccasions = async (req, res) => {
    try {
        const occasions = await Occasion.find({}).sort({ displayOrder: 1, name: 1 });
        res.json({ success: true, data: occasions });
    } catch (error) {
        console.error('Error fetching occasions:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch occasions' });
    }
};

// Create occasion
export const createOccasion = async (req, res) => {
    try {
        const { name, category, description, shortDescription, emoji,
            metaTitle, metaDescription, popularFor, isFeatured, displayOrder } = req.body;

        if (!name) {
            return res.status(400).json({ success: false, message: 'Occasion name is required' });
        }

        let imageData = {};
        if (req.file) {
            const uploadResult = await cloudinary.uploader.upload(req.file.path, {
                folder: 'occasions',
                resource_type: 'image'
            });
            imageData = {
                url: uploadResult.secure_url,
                altText: name
            };
            // Clean up temp file
            if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        }

        const occasion = new Occasion({
            name,
            category: category || 'personal',
            description,
            shortDescription,
            emoji: emoji || '🎁',
            image: imageData,
            metaTitle,
            metaDescription,
            popularFor: popularFor ? JSON.parse(popularFor) : [],
            isFeatured: isFeatured === 'true',
            displayOrder: displayOrder || 0
        });

        await occasion.save();
        res.status(201).json({ success: true, message: 'Occasion created successfully', data: occasion });
    } catch (error) {
        console.error('Error creating occasion:', error);
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: 'Occasion with this name already exists' });
        }
        res.status(500).json({ success: false, message: 'Failed to create occasion' });
    }
};

// Update occasion
export const updateOccasion = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = { ...req.body };

        // Handle popularFor array
        if (updates.popularFor && typeof updates.popularFor === 'string') {
            updates.popularFor = JSON.parse(updates.popularFor);
        }

        // Handle boolean fields
        if (updates.isFeatured !== undefined) {
            updates.isFeatured = updates.isFeatured === 'true' || updates.isFeatured === true;
        }
        if (updates.isActive !== undefined) {
            updates.isActive = updates.isActive === 'true' || updates.isActive === true;
        }

        // Handle image upload
        if (req.file) {
            const uploadResult = await cloudinary.uploader.upload(req.file.path, {
                folder: 'occasions',
                resource_type: 'image'
            });
            updates.image = {
                url: uploadResult.secure_url,
                altText: updates.name || ''
            };
            if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        }

        const occasion = await Occasion.findByIdAndUpdate(id, updates, { new: true });
        if (!occasion) {
            return res.status(404).json({ success: false, message: 'Occasion not found' });
        }

        res.json({ success: true, message: 'Occasion updated successfully', data: occasion });
    } catch (error) {
        console.error('Error updating occasion:', error);
        res.status(500).json({ success: false, message: 'Failed to update occasion' });
    }
};

// Delete occasion
export const deleteOccasion = async (req, res) => {
    try {
        const { id } = req.params;
        const occasion = await Occasion.findByIdAndDelete(id);
        if (!occasion) {
            return res.status(404).json({ success: false, message: 'Occasion not found' });
        }
        res.json({ success: true, message: 'Occasion deleted successfully' });
    } catch (error) {
        console.error('Error deleting occasion:', error);
        res.status(500).json({ success: false, message: 'Failed to delete occasion' });
    }
};

// ============================================
// STATE MANAGEMENT
// ============================================

// Get all states (admin view)
export const getAllStates = async (req, res) => {
    try {
        const states = await State.find({}).sort({ displayOrder: 1, name: 1 });
        res.json({ success: true, data: states });
    } catch (error) {
        console.error('Error fetching states:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch states' });
    }
};

// Create state
export const createState = async (req, res) => {
    try {
        const { name, description, shortDescription, famousFor, highlights,
            metaTitle, metaDescription, isFeatured, isNorthEast, displayOrder } = req.body;

        if (!name) {
            return res.status(400).json({ success: false, message: 'State name is required' });
        }

        let imageData = {};
        if (req.file) {
            const uploadResult = await cloudinary.uploader.upload(req.file.path, {
                folder: 'states',
                resource_type: 'image'
            });
            imageData = {
                url: uploadResult.secure_url,
                altText: name
            };
            if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        }

        const state = new State({
            name,
            description,
            shortDescription,
            famousFor,
            highlights: highlights ? JSON.parse(highlights) : [],
            image: imageData,
            metaTitle,
            metaDescription,
            isFeatured: isFeatured === 'true',
            isNorthEast: isNorthEast !== 'false',
            displayOrder: displayOrder || 0
        });

        await state.save();
        res.status(201).json({ success: true, message: 'State created successfully', data: state });
    } catch (error) {
        console.error('Error creating state:', error);
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: 'State with this name already exists' });
        }
        res.status(500).json({ success: false, message: 'Failed to create state' });
    }
};

// Update state
export const updateState = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = { ...req.body };

        // Handle highlights array
        if (updates.highlights && typeof updates.highlights === 'string') {
            updates.highlights = JSON.parse(updates.highlights);
        }

        // Handle boolean fields
        if (updates.isFeatured !== undefined) {
            updates.isFeatured = updates.isFeatured === 'true' || updates.isFeatured === true;
        }
        if (updates.isActive !== undefined) {
            updates.isActive = updates.isActive === 'true' || updates.isActive === true;
        }
        if (updates.isNorthEast !== undefined) {
            updates.isNorthEast = updates.isNorthEast === 'true' || updates.isNorthEast === true;
        }

        // Handle image upload
        if (req.file) {
            const uploadResult = await cloudinary.uploader.upload(req.file.path, {
                folder: 'states',
                resource_type: 'image'
            });
            updates.image = {
                url: uploadResult.secure_url,
                altText: updates.name || ''
            };
            if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        }

        const state = await State.findByIdAndUpdate(id, updates, { new: true });
        if (!state) {
            return res.status(404).json({ success: false, message: 'State not found' });
        }

        res.json({ success: true, message: 'State updated successfully', data: state });
    } catch (error) {
        console.error('Error updating state:', error);
        res.status(500).json({ success: false, message: 'Failed to update state' });
    }
};

// Delete state
export const deleteState = async (req, res) => {
    try {
        const { id } = req.params;
        const state = await State.findByIdAndDelete(id);
        if (!state) {
            return res.status(404).json({ success: false, message: 'State not found' });
        }
        res.json({ success: true, message: 'State deleted successfully' });
    } catch (error) {
        console.error('Error deleting state:', error);
        res.status(500).json({ success: false, message: 'Failed to delete state' });
    }
};

// ============================================
// GIFT FOR (RELATION) MANAGEMENT
// ============================================

// Get all relations (admin view)
export const getAllGiftFor = async (req, res) => {
    try {
        const relations = await GiftFor.find({}).sort({ displayOrder: 1, name: 1 });
        res.json({ success: true, data: relations });
    } catch (error) {
        console.error('Error fetching gift-for relations:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch relations' });
    }
};

// Create relation
export const createGiftFor = async (req, res) => {
    try {
        const { name, category, description, emoji,
            metaTitle, metaDescription, isFeatured, displayOrder } = req.body;

        if (!name) {
            return res.status(400).json({ success: false, message: 'Relation name is required' });
        }

        let imageData = {};
        if (req.file) {
            const uploadResult = await cloudinary.uploader.upload(req.file.path, {
                folder: 'giftfor',
                resource_type: 'image'
            });
            imageData = {
                url: uploadResult.secure_url,
                altText: name
            };
            if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        }

        const relation = new GiftFor({
            name,
            category: category || 'family',
            description,
            emoji: emoji || '🎁',
            image: imageData,
            metaTitle,
            metaDescription,
            isFeatured: isFeatured === 'true',
            displayOrder: displayOrder || 0
        });

        await relation.save();
        res.status(201).json({ success: true, message: 'Relation created successfully', data: relation });
    } catch (error) {
        console.error('Error creating relation:', error);
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: 'Relation with this name already exists' });
        }
        res.status(500).json({ success: false, message: 'Failed to create relation' });
    }
};

// Update relation
export const updateGiftFor = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = { ...req.body };

        // Handle boolean fields
        if (updates.isFeatured !== undefined) {
            updates.isFeatured = updates.isFeatured === 'true' || updates.isFeatured === true;
        }
        if (updates.isActive !== undefined) {
            updates.isActive = updates.isActive === 'true' || updates.isActive === true;
        }

        // Handle image upload
        if (req.file) {
            const uploadResult = await cloudinary.uploader.upload(req.file.path, {
                folder: 'giftfor',
                resource_type: 'image'
            });
            updates.image = {
                url: uploadResult.secure_url,
                altText: updates.name || ''
            };
            if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        }

        const relation = await GiftFor.findByIdAndUpdate(id, updates, { new: true });
        if (!relation) {
            return res.status(404).json({ success: false, message: 'Relation not found' });
        }

        res.json({ success: true, message: 'Relation updated successfully', data: relation });
    } catch (error) {
        console.error('Error updating relation:', error);
        res.status(500).json({ success: false, message: 'Failed to update relation' });
    }
};

// Delete relation
export const deleteGiftFor = async (req, res) => {
    try {
        const { id } = req.params;
        const relation = await GiftFor.findByIdAndDelete(id);
        if (!relation) {
            return res.status(404).json({ success: false, message: 'Relation not found' });
        }
        res.json({ success: true, message: 'Relation deleted successfully' });
    } catch (error) {
        console.error('Error deleting relation:', error);
        res.status(500).json({ success: false, message: 'Failed to delete relation' });
    }
};

// ============================================
// SUBCATEGORY MANAGEMENT (Enhanced)
// ============================================

// Get all subcategories with category details
export const getAllSubcategories = async (req, res) => {
    try {
        const subcategories = await Subcategory.find({})
            .populate('category', 'categoryname')
            .sort({ displayOrder: 1, subcategory: 1 });
        res.json({ success: true, data: subcategories });
    } catch (error) {
        console.error('Error fetching subcategories:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch subcategories' });
    }
};

// Create subcategory with image
export const createSubcategory = async (req, res) => {
    try {
        const { subcategory, category, description, displayOrder } = req.body;

        if (!subcategory || !category) {
            return res.status(400).json({ success: false, message: 'Subcategory name and category are required' });
        }

        let imageData = {};
        if (req.file) {
            const uploadResult = await cloudinary.uploader.upload(req.file.path, {
                folder: 'subcategories',
                resource_type: 'image'
            });
            imageData = {
                url: uploadResult.secure_url,
                altText: subcategory
            };
            if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        }

        const newSubcategory = new Subcategory({
            subcategory,
            category,
            description,
            image: imageData,
            displayOrder: displayOrder || 0
        });

        await newSubcategory.save();

        const populated = await Subcategory.findById(newSubcategory._id).populate('category', 'categoryname');
        res.status(201).json({ success: true, message: 'Subcategory created successfully', data: populated });
    } catch (error) {
        console.error('Error creating subcategory:', error);
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: 'Subcategory with this name already exists' });
        }
        res.status(500).json({ success: false, message: 'Failed to create subcategory' });
    }
};

// Update subcategory
export const updateSubcategory = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = { ...req.body };

        // Handle boolean fields
        if (updates.isActive !== undefined) {
            updates.isActive = updates.isActive === 'true' || updates.isActive === true;
        }

        // Handle image upload
        if (req.file) {
            const uploadResult = await cloudinary.uploader.upload(req.file.path, {
                folder: 'subcategories',
                resource_type: 'image'
            });
            updates.image = {
                url: uploadResult.secure_url,
                altText: updates.subcategory || ''
            };
            if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        }

        const subcategory = await Subcategory.findByIdAndUpdate(id, updates, { new: true })
            .populate('category', 'categoryname');
        if (!subcategory) {
            return res.status(404).json({ success: false, message: 'Subcategory not found' });
        }

        res.json({ success: true, message: 'Subcategory updated successfully', data: subcategory });
    } catch (error) {
        console.error('Error updating subcategory:', error);
        res.status(500).json({ success: false, message: 'Failed to update subcategory' });
    }
};

// Delete subcategory
export const deleteSubcategory = async (req, res) => {
    try {
        const { id } = req.params;
        const subcategory = await Subcategory.findByIdAndDelete(id);
        if (!subcategory) {
            return res.status(404).json({ success: false, message: 'Subcategory not found' });
        }
        res.json({ success: true, message: 'Subcategory deleted successfully' });
    } catch (error) {
        console.error('Error deleting subcategory:', error);
        res.status(500).json({ success: false, message: 'Failed to delete subcategory' });
    }
};

// ============================================
// BULK SEED FUNCTIONS
// ============================================

// Seed default occasions
export const seedOccasions = async (req, res) => {
    try {
        const defaultOccasions = [
            // Corporate
            { name: 'Diwali', category: 'corporate', emoji: '🪔', description: 'Festival of lights', isFeatured: true, displayOrder: 1 },
            { name: 'New Year', category: 'corporate', emoji: '🎉', description: 'New year celebrations', displayOrder: 2 },
            { name: 'Christmas', category: 'corporate', emoji: '🎄', description: 'Christmas gifting', displayOrder: 3 },
            { name: 'Corporate Gifting', category: 'corporate', emoji: '🏢', description: 'Business gifts', isFeatured: true, displayOrder: 4 },
            { name: 'Employee Recognition', category: 'corporate', emoji: '🏆', description: 'Reward employees', displayOrder: 5 },
            { name: 'Client Appreciation', category: 'corporate', emoji: '🤝', description: 'Thank clients', displayOrder: 6 },

            // Personal
            { name: 'Birthday', category: 'personal', emoji: '🎂', description: 'Birthday celebrations', isFeatured: true, displayOrder: 10 },
            { name: 'Wedding', category: 'personal', emoji: '💍', description: 'Wedding gifts', isFeatured: true, displayOrder: 11 },
            { name: 'Anniversary', category: 'personal', emoji: '💕', description: 'Anniversary celebrations', displayOrder: 12 },
            { name: 'Housewarming', category: 'personal', emoji: '🏠', description: 'New home gifts', displayOrder: 13 },
            { name: 'Baby Shower', category: 'personal', emoji: '👶', description: 'Baby shower gifts', displayOrder: 14 },
            { name: 'Graduation', category: 'personal', emoji: '🎓', description: 'Graduation gifts', displayOrder: 15 },

            // Seasonal/Festival
            { name: 'Durga Puja', category: 'seasonal', emoji: '🪔', description: 'Durga Puja festivities', isFeatured: true, displayOrder: 20 },
            { name: 'Bihu', category: 'seasonal', emoji: '🌾', description: 'Assamese New Year', isFeatured: true, displayOrder: 21 },
            { name: 'Holi', category: 'seasonal', emoji: '🌈', description: 'Festival of colors', displayOrder: 22 },
            { name: 'Eid', category: 'seasonal', emoji: '☪️', description: 'Eid celebrations', displayOrder: 23 },
            { name: 'Raksha Bandhan', category: 'festival', emoji: '🎀', description: 'Brother-sister bond', displayOrder: 24 },
            { name: 'Mothers Day', category: 'festival', emoji: '💐', description: 'Celebrate mothers', displayOrder: 25 },
            { name: 'Fathers Day', category: 'festival', emoji: '👔', description: 'Celebrate fathers', displayOrder: 26 },
            { name: 'Valentines Day', category: 'festival', emoji: '❤️', description: 'Day of love', displayOrder: 27 }
        ];

        for (const occ of defaultOccasions) {
            await Occasion.findOneAndUpdate(
                { name: occ.name },
                occ,
                { upsert: true, new: true }
            );
        }

        res.json({ success: true, message: `Seeded ${defaultOccasions.length} occasions` });
    } catch (error) {
        console.error('Error seeding occasions:', error);
        res.status(500).json({ success: false, message: 'Failed to seed occasions' });
    }
};

// Seed default states - ALL Indian States and Union Territories
export const seedStates = async (req, res) => {
    try {
        const defaultStates = [
            // ==========================================
            // NORTH EAST INDIA (Priority - Featured)
            // ==========================================
            {
                name: 'Assam',
                famousFor: 'Tea, Muga Silk, Cane & Bamboo',
                description: 'Home of the world-famous Assam tea and the exquisite golden Muga silk. Assam\'s rich cultural heritage is reflected in its traditional bell metal craft, cane and bamboo works, and vibrant Bihu festival traditions.',
                shortDescription: 'Land of tea gardens and golden Muga silk',
                highlights: ['Muga Silk', 'Assam Tea', 'Bamboo Crafts', 'Bell Metal', 'Eri Silk', 'Gamosa'],
                isNorthEast: true,
                isFeatured: true,
                displayOrder: 1
            },
            {
                name: 'Meghalaya',
                famousFor: 'Organic Honey, Living Root Bridges',
                description: 'The "Abode of Clouds" is home to pristine organic products, unique living root bridges, and the beautiful Khasi, Jaintia, and Garo tribal cultures. Known for organic honey, handwoven cane and bamboo products.',
                shortDescription: 'Land of clouds and living root bridges',
                highlights: ['Organic Honey', 'Cane & Bamboo', 'Khasi Textiles', 'Orange Honey', 'Pottery'],
                isNorthEast: true,
                isFeatured: true,
                displayOrder: 2
            },
            {
                name: 'Nagaland',
                famousFor: 'Naga Shawls, Tribal Jewelry',
                description: 'Land of festivals featuring rich tribal heritage with distinctive handwoven shawls, intricate beaded jewelry, wood carvings, and the famous Hornbill Festival celebrating Naga culture.',
                shortDescription: 'Land of festivals and warrior tribes',
                highlights: ['Naga Shawls', 'Tribal Jewelry', 'Wood Carvings', 'Hornbill Festival', 'Black Pottery'],
                isNorthEast: true,
                isFeatured: true,
                displayOrder: 3
            },
            {
                name: 'Manipur',
                famousFor: 'Longpi Pottery, Moirang Phee',
                description: 'Known for elegant handloom traditions, unique black Longpi pottery made without a potter\'s wheel, Kouna (water reed) craft, and the beautiful Loktak Lake with its floating islands.',
                shortDescription: 'Jewel of India with unique Longpi pottery',
                highlights: ['Longpi Pottery', 'Moirang Phee', 'Kouna Craft', 'Manipuri Dance', 'Shaphee Lanphee'],
                isNorthEast: true,
                isFeatured: true,
                displayOrder: 4
            },
            {
                name: 'Mizoram',
                famousFor: 'Puan Textiles, Bamboo Products',
                description: 'Land of rolling hills featuring traditional Mizo Puan fabrics with distinctive patterns, exquisite bamboo and cane furniture, and the vibrant Chapchar Kut festival.',
                shortDescription: 'Land of the hill people',
                highlights: ['Puan Textiles', 'Bamboo Products', 'Cane Furniture', 'Mizo Handicrafts'],
                isNorthEast: true,
                displayOrder: 5
            },
            {
                name: 'Arunachal Pradesh',
                famousFor: 'Tribal Textiles, Carpets',
                description: 'The Land of the Rising Sun boasts diverse tribal cultures with 26 major tribes. Famous for Monpa carpets, Yak products, intricate tribal textiles, and the majestic Tawang Monastery.',
                shortDescription: 'Land of the rising sun',
                highlights: ['Monpa Carpets', 'Yak Products', 'Tribal Textiles', 'Thangka Paintings', 'Cane Products'],
                isNorthEast: true,
                displayOrder: 6
            },
            {
                name: 'Tripura',
                famousFor: 'Bamboo Crafts, Risa Textiles',
                description: 'Known for exquisite bamboo and cane work, traditional Risa and Riha textiles, and the unique bamboo dolls. The state\'s tribal heritage is reflected in its diverse handicrafts.',
                shortDescription: 'Land of bamboo and tribal crafts',
                highlights: ['Bamboo Crafts', 'Risa Textile', 'Bamboo Dolls', 'Tripura Handloom', 'Cane Furniture'],
                isNorthEast: true,
                isFeatured: true,
                displayOrder: 7
            },
            {
                name: 'Sikkim',
                famousFor: 'Organic Products, Thangka Art',
                description: 'India\'s first fully organic state offering Himalayan treasures including organic tea, large cardamom, beautiful Thangka paintings, and traditional Sikkimese carpets with Buddhist motifs.',
                shortDescription: 'India\'s first organic state',
                highlights: ['Organic Tea', 'Thangka Paintings', 'Large Cardamom', 'Sikkimese Carpets', 'Organic Honey'],
                isNorthEast: true,
                isFeatured: true,
                displayOrder: 8
            },

            // ==========================================
            // OTHER MAJOR STATES OF INDIA
            // ==========================================
            {
                name: 'Rajasthan',
                famousFor: 'Block Printing, Blue Pottery',
                description: 'Land of kings featuring vibrant textiles, traditional block printing, exquisite blue pottery, intricate jewelry, and leather craft. Home to the famous Bandhani tie-dye and mirror work.',
                shortDescription: 'Land of kings and vibrant crafts',
                highlights: ['Block Printing', 'Blue Pottery', 'Bandhani', 'Leather Craft', 'Jewelry', 'Puppets'],
                isNorthEast: false,
                isFeatured: true,
                displayOrder: 10
            },
            {
                name: 'Jammu and Kashmir',
                famousFor: 'Pashmina, Kashmiri Carpets',
                description: 'Paradise on Earth known for world-famous Pashmina shawls, intricate Kashmiri carpets, walnut wood carving, papier-mâché art, and saffron - the golden spice.',
                shortDescription: 'Paradise on Earth',
                highlights: ['Pashmina Shawls', 'Kashmiri Carpets', 'Walnut Wood Carving', 'Papier-Mâché', 'Saffron'],
                isNorthEast: false,
                isFeatured: true,
                displayOrder: 11
            },
            {
                name: 'Kerala',
                famousFor: 'Coir Products, Spices',
                description: 'God\'s Own Country famous for traditional Kasavu sarees, coir products, exquisite Aranmula metal mirrors, spices, and Kathakali masks reflecting its rich cultural heritage.',
                shortDescription: 'God\'s Own Country',
                highlights: ['Kasavu Sarees', 'Coir Products', 'Spices', 'Aranmula Mirrors', 'Kathakali Masks'],
                isNorthEast: false,
                isFeatured: true,
                displayOrder: 12
            },
            {
                name: 'Gujarat',
                famousFor: 'Bandhani, Kutchi Embroidery',
                description: 'Land of the White Desert featuring traditional Patola silk, colorful Kutchi embroidery, Bandhani tie-dye, brass work, and the famous Rann Utsav cultural festival.',
                shortDescription: 'Land of legends and vibrant textiles',
                highlights: ['Patola Silk', 'Kutchi Embroidery', 'Bandhani', 'Brass Work', 'Tangaliya Weave'],
                isNorthEast: false,
                displayOrder: 13
            },
            {
                name: 'West Bengal',
                famousFor: 'Terracotta, Baluchari Sarees',
                description: 'Cultural capital of India known for Durga Puja artistry, terracotta temples, Baluchari and Jamdani sarees, Dokra metal craft, and Shantiniketan leather bags.',
                shortDescription: 'Cultural capital of India',
                highlights: ['Baluchari Sarees', 'Terracotta', 'Dokra Craft', 'Shantiniketan Leather', 'Jamdani'],
                isNorthEast: false,
                isFeatured: true,
                displayOrder: 14
            },
            {
                name: 'Tamil Nadu',
                famousFor: 'Kanchipuram Silk, Tanjore Art',
                description: 'Land of temples famous for Kanchipuram silk sarees, Tanjore paintings with gold leaf, bronze sculptures, stone carvings, and traditional Korai grass mats.',
                shortDescription: 'Land of temples and silk',
                highlights: ['Kanchipuram Silk', 'Tanjore Paintings', 'Bronze Sculptures', 'Stone Carving', 'Korai Mats'],
                isNorthEast: false,
                displayOrder: 15
            },
            {
                name: 'Maharashtra',
                famousFor: 'Paithani Sarees, Kolhapuri Chappal',
                description: 'Land of Maratha heritage featuring elegant Paithani sarees, famous Kolhapuri leather chappals, Warli tribal art, Bidriware, and traditional Sawantwadi lacquerware.',
                shortDescription: 'Land of Maratha heritage',
                highlights: ['Paithani Sarees', 'Kolhapuri Chappal', 'Warli Art', 'Bidriware', 'Lacquerware'],
                isNorthEast: false,
                displayOrder: 16
            },
            {
                name: 'Karnataka',
                famousFor: 'Mysore Silk, Sandalwood',
                description: 'Land of sandalwood and silk featuring Mysore silk sarees, sandalwood carvings, Bidri work, Channapatna wooden toys, and traditional Ilkal sarees.',
                shortDescription: 'Land of sandalwood and silk',
                highlights: ['Mysore Silk', 'Sandalwood Products', 'Bidri Work', 'Channapatna Toys', 'Ilkal Sarees'],
                isNorthEast: false,
                displayOrder: 17
            },
            {
                name: 'Uttar Pradesh',
                famousFor: 'Chikankari, Brassware',
                description: 'Heart of India featuring delicate Lucknowi Chikankari embroidery, Varanasi Banarasi sarees, Moradabad brassware, Agra marble inlay, and traditional perfumes.',
                shortDescription: 'Heart of Indian heritage',
                highlights: ['Chikankari', 'Banarasi Sarees', 'Brassware', 'Marble Inlay', 'Perfumes'],
                isNorthEast: false,
                isFeatured: true,
                displayOrder: 18
            },
            {
                name: 'Madhya Pradesh',
                famousFor: 'Chanderi Silk, Gond Art',
                description: 'Heart of India known for elegant Chanderi and Maheshwari fabrics, tribal Gond paintings, Bagh prints, zari-zardozi work, and traditional bell metal crafts.',
                shortDescription: 'Heart of incredible India',
                highlights: ['Chanderi Silk', 'Maheshwari Sarees', 'Gond Art', 'Bagh Prints', 'Zardozi'],
                isNorthEast: false,
                displayOrder: 19
            },
            {
                name: 'Odisha',
                famousFor: 'Pattachitra, Sambalpuri',
                description: 'Land of temples featuring traditional Pattachitra paintings, Sambalpuri ikat textiles, silver filigree work, appliqué craft, and Dhokra metal casting.',
                shortDescription: 'Land of art and temples',
                highlights: ['Pattachitra', 'Sambalpuri Ikat', 'Silver Filigree', 'Appliqué', 'Dhokra Craft'],
                isNorthEast: false,
                displayOrder: 20
            },
            {
                name: 'Andhra Pradesh',
                famousFor: 'Kalamkari, Kondapalli Toys',
                description: 'Land of Kohinoor featuring Kalamkari hand-painted textiles, Kondapalli wooden toys, Etikoppaka lacquerware, Mangalagiri cotton, and Lepakshi handicrafts.',
                shortDescription: 'Land of rich heritage',
                highlights: ['Kalamkari', 'Kondapalli Toys', 'Etikoppaka Lacquer', 'Mangalagiri Cotton', 'Bidri Work'],
                isNorthEast: false,
                displayOrder: 21
            },
            {
                name: 'Telangana',
                famousFor: 'Bidri Work, Nirmal Paintings',
                description: 'Land of pearls and heritage featuring intricate Hyderabadi pearls, Bidri metalwork, Nirmal paintings, Pochampally ikat, and traditional Pembarthi brass craft.',
                shortDescription: 'Land of pearls and heritage',
                highlights: ['Hyderabadi Pearls', 'Bidri Work', 'Nirmal Art', 'Pochampally Ikat', 'Pembarthi Brass'],
                isNorthEast: false,
                displayOrder: 22
            },
            {
                name: 'Punjab',
                famousFor: 'Phulkari, Sports Goods',
                description: 'Land of five rivers featuring vibrant Phulkari embroidery, traditional juttis (mojris), Punjabi paranda, woodwork, and the famous Amritsar crafts.',
                shortDescription: 'Land of five rivers',
                highlights: ['Phulkari', 'Punjabi Juttis', 'Paranda', 'Woodwork', 'Brass Products'],
                isNorthEast: false,
                displayOrder: 23
            },
            {
                name: 'Himachal Pradesh',
                famousFor: 'Kullu Shawls, Chamba Rumals',
                description: 'Land of gods featuring world-famous Kullu shawls, traditional Chamba rumals, Kinnauri woolens, Kangra paintings, and beautiful Himachali caps.',
                shortDescription: 'Land of the gods',
                highlights: ['Kullu Shawls', 'Chamba Rumals', 'Kinnauri Woolens', 'Kangra Paintings', 'Himachali Caps'],
                isNorthEast: false,
                displayOrder: 24
            },
            {
                name: 'Uttarakhand',
                famousFor: 'Ringal Craft, Aipan Art',
                description: 'Land of spirituality featuring traditional Ringal bamboo craft, Aipan folk art, woolen products, wooden utensils, and organic products from the Himalayas.',
                shortDescription: 'Land of spirituality',
                highlights: ['Ringal Craft', 'Aipan Art', 'Woolen Products', 'Wooden Crafts', 'Organic Honey'],
                isNorthEast: false,
                displayOrder: 25
            },
            {
                name: 'Bihar',
                famousFor: 'Madhubani Paintings, Sikki Craft',
                description: 'Ancient land of learning featuring world-famous Madhubani paintings, Sikki grass craft, Sujini embroidery, Tikuli art, and traditional Bhagalpuri silk.',
                shortDescription: 'Ancient land of learning',
                highlights: ['Madhubani Art', 'Sikki Craft', 'Sujini', 'Tikuli Art', 'Bhagalpuri Silk'],
                isNorthEast: false,
                displayOrder: 26
            },
            {
                name: 'Jharkhand',
                famousFor: 'Paitkar Paintings, Dokra Craft',
                description: 'Land of forests and minerals featuring tribal Paitkar paintings, Dokra metal casting, bamboo craft, stone carvings, and traditional Santhali textiles.',
                shortDescription: 'Land of forests',
                highlights: ['Paitkar Paintings', 'Dokra Craft', 'Bamboo Products', 'Stone Carving', 'Lac Bangles'],
                isNorthEast: false,
                displayOrder: 27
            },
            {
                name: 'Chhattisgarh',
                famousFor: 'Bell Metal, Kosa Silk',
                description: 'Heart of tribal India featuring traditional Bell metal (Dhokra), Kosa silk textiles, bamboo craft, terracotta, and tribal tattoo art traditions.',
                shortDescription: 'Heart of tribal India',
                highlights: ['Bell Metal', 'Kosa Silk', 'Bamboo Craft', 'Terracotta', 'Tribal Art'],
                isNorthEast: false,
                displayOrder: 28
            },
            {
                name: 'Goa',
                famousFor: 'Cashew Products, Coconut Crafts',
                description: 'Pearl of the Orient featuring traditional cashew products, coconut shell crafts, crochet work, azulejos tiles, and fusion of Portuguese-Indian heritage.',
                shortDescription: 'Pearl of the Orient',
                highlights: ['Cashew Products', 'Coconut Crafts', 'Crochet Work', 'Bamboo Items', 'Terracotta'],
                isNorthEast: false,
                displayOrder: 29
            },
            {
                name: 'Haryana',
                famousFor: 'Phulkari, Durrie Weaving',
                description: 'Land of Bhagavad Gita featuring traditional Phulkari embroidery, durrie weaving, pottery, brass and copper work, and handloom products.',
                shortDescription: 'Land of the Gita',
                highlights: ['Phulkari', 'Durrie Weaving', 'Pottery', 'Brass Work', 'Handloom'],
                isNorthEast: false,
                displayOrder: 30
            },

            // ==========================================
            // UNION TERRITORIES
            // ==========================================
            {
                name: 'Ladakh',
                famousFor: 'Pashmina, Thangka',
                description: 'Land of high passes featuring ultra-fine Ladakhi Pashmina, Thangka Buddhist paintings, apricot products, and traditional woolen crafts.',
                shortDescription: 'Land of high passes',
                highlights: ['Ladakhi Pashmina', 'Thangka Art', 'Apricot Products', 'Woolen Crafts', 'Turquoise Jewelry'],
                isNorthEast: false,
                displayOrder: 31
            },
            {
                name: 'Puducherry',
                famousFor: 'Pottery, Leather Goods',
                description: 'French Riviera of the East featuring traditional pottery, leather goods, handloom textiles, Auroville handicrafts, and incense products.',
                shortDescription: 'French Riviera of the East',
                highlights: ['Pottery', 'Leather Goods', 'Incense', 'Auroville Crafts', 'Textiles'],
                isNorthEast: false,
                displayOrder: 32
            },
            {
                name: 'Andaman and Nicobar Islands',
                famousFor: 'Sea Shell Crafts, Coconut Products',
                description: 'Emerald islands featuring beautiful sea shell crafts, coconut shell products, bamboo items, Nicobari hats, and exotic wood carvings.',
                shortDescription: 'Emerald Islands',
                highlights: ['Shell Crafts', 'Coconut Products', 'Bamboo Items', 'Wood Carving', 'Nicobari Hats'],
                isNorthEast: false,
                displayOrder: 33
            },
            {
                name: 'Lakshadweep',
                famousFor: 'Coir Products, Coconut Crafts',
                description: 'Coral islands featuring traditional coir products, coconut shell crafts, shell jewelry, and sustainable island handicrafts.',
                shortDescription: 'Coral Paradise',
                highlights: ['Coir Products', 'Coconut Crafts', 'Shell Jewelry', 'Traditional Mats'],
                isNorthEast: false,
                displayOrder: 34
            },
            {
                name: 'Delhi',
                famousFor: 'Zari Zardozi, Meenakari',
                description: 'National Capital featuring exquisite Zari Zardozi embroidery, Meenakari jewelry, leather goods, and a blend of crafts from across India.',
                shortDescription: 'Cultural melting pot',
                highlights: ['Zari Zardozi', 'Meenakari', 'Leather Goods', 'Jewelry', 'Textiles'],
                isNorthEast: false,
                displayOrder: 35
            },
            {
                name: 'Dadra and Nagar Haveli and Daman and Diu',
                famousFor: 'Bamboo Products, Warli Art',
                description: 'Tribal territories featuring traditional Warli art, bamboo products, tribal handicrafts, and a blend of Portuguese-Indian influences.',
                shortDescription: 'Tribal crafts heritage',
                highlights: ['Warli Art', 'Bamboo Products', 'Tribal Crafts', 'Wooden Items'],
                isNorthEast: false,
                displayOrder: 36
            },
            {
                name: 'Chandigarh',
                famousFor: 'Phulkari, Durries',
                description: 'The City Beautiful featuring Punjabi Phulkari embroidery, traditional durries, handloom products, and modernist crafts.',
                shortDescription: 'The City Beautiful',
                highlights: ['Phulkari', 'Durries', 'Handloom', 'Pottery'],
                isNorthEast: false,
                displayOrder: 37
            }
        ];

        const generateSlug = (name) => {
            return name
                .toLowerCase()
                .replace(/[^a-z0-9\s-]/g, '')
                .replace(/\s+/g, '-')
                .replace(/-+/g, '-')
                .trim();
        };

        for (const rawState of defaultStates) {
            const state = {
                ...rawState,
                slug: rawState.slug || generateSlug(rawState.name)
            };

            await State.findOneAndUpdate(
                { name: state.name },
                state,
                { upsert: true, new: true }
            );
        }

        res.json({ success: true, message: `Seeded ${defaultStates.length} states and union territories` });
    } catch (error) {
        console.error('Error seeding states:', error);
        res.status(500).json({ success: false, message: 'Failed to seed states: ' + error.message });
    }
};

// Seed default gift-for relations
export const seedGiftFor = async (req, res) => {
    try {
        const defaultRelations = [
            // Family
            {
                name: 'Mother',
                category: 'family',
                emoji: '👩',
                description: 'Heartfelt gifts for mom',
                image: { url: 'https://www.fnp.com/assets/images/custom/for-her-2023/by_recipients/Mother_web.jpg' },
                isFeatured: true,
                displayOrder: 1
            },
            {
                name: 'Father',
                category: 'family',
                emoji: '👨',
                description: 'Classic picks for dad',
                image: { url: 'https://www.fnp.com/assets/images/custom/for-him/by-recipients/Father_web.jpg' },
                isFeatured: true,
                displayOrder: 2
            },
            {
                name: 'Sister',
                category: 'family',
                emoji: '👧',
                description: 'Special treasures for sister',
                image: { url: 'https://www.fnp.com/assets/images/custom/for-her-2023/by_recipients/Sisters_web.jpg' },
                displayOrder: 4
            },
            {
                name: 'Brother',
                category: 'family',
                emoji: '👦',
                description: 'Cool gifts for brother',
                image: { url: 'https://www.fnp.com/assets/images/custom/for-him/by-recipients/Brother_web.jpg' },
                displayOrder: 3
            },
            {
                name: 'Daughter',
                category: 'family',
                emoji: '👧',
                description: 'Beautiful gifts for her',
                image: { url: 'https://www.fnp.com/assets/images/custom/for-her-2023/by_recipients/Daughter_web.jpg' },
                displayOrder: 6
            },
            {
                name: 'Son',
                category: 'family',
                emoji: '🧒',
                description: 'Gifts he will cherish',
                image: { url: 'https://www.fnp.com/assets/images/custom/for-him/by-recipients/Son_web.jpg' },
                displayOrder: 5
            },
            {
                name: 'Grandmother',
                category: 'family',
                emoji: '👵',
                description: 'Timeless gifts for grandma',
                image: { url: 'https://www.fnp.com/assets/images/custom/for-her-2023/by_recipients/Grandmother_web.jpg' },
                displayOrder: 7
            },
            { name: 'Grandfather', category: 'family', emoji: '👴', description: 'Timeless gifts for grandpa', displayOrder: 8 },

            // Romantic
            {
                name: 'Wife',
                category: 'romantic',
                emoji: '💍',
                description: 'Romantic gifts for her',
                image: { url: 'https://www.fnp.com/assets/images/custom/for-her-2023/by_recipients/Wife_web.jpg' },
                isFeatured: true,
                displayOrder: 10
            },
            {
                name: 'Husband',
                category: 'romantic',
                emoji: '🎩',
                description: 'Unique finds for him',
                image: { url: 'https://www.fnp.com/assets/images/custom/misc/recepient/Recipient_Husband_Desk_41224.jpg' },
                isFeatured: true,
                displayOrder: 11
            },
            {
                name: 'Fiance',
                category: 'romantic',
                emoji: '💍',
                description: 'For your future together',
                image: { url: 'https://www.fnp.com/assets/images/custom/for-her-2023/by_recipients/Fiancee_web.jpg' },
                displayOrder: 12
            },
            {
                name: 'Girlfriend',
                category: 'romantic',
                emoji: '💏',
                description: 'Sweet surprises for your girl',
                image: { url: 'https://www.fnp.com/assets/images/custom/for-her-2023/by_recipients/Girlfriend_web.jpg' },
                displayOrder: 13
            },
            {
                name: 'Boyfriend',
                category: 'romantic',
                emoji: '💑',
                description: 'Something special for your guy',
                image: { url: 'https://www.fnp.com/assets/images/custom/misc/recepient/Recipient_BF_Desk_41224.jpg' },
                displayOrder: 14
            },

            // Friends & Professional
            {
                name: 'Friend',
                category: 'friends',
                emoji: '🤝',
                description: 'Fun gifts for friends',
                image: { url: 'https://www.fnp.com/assets/images/custom/misc/recepient/Recipient_Freinds_Desk_41224.jpg' },
                displayOrder: 20
            },
            { name: 'Colleague', category: 'professional', emoji: '💼', description: 'Professional office gifts', displayOrder: 22 },
            { name: 'Boss', category: 'professional', emoji: '👔', description: 'Respectful gifts for boss', displayOrder: 23 },
            { name: 'Teacher', category: 'professional', emoji: '📚', description: 'Appreciation for teachers', displayOrder: 24 },

            // Age/Gender
            { name: 'Kids', category: 'age-gender', emoji: '👶', description: 'Fun gifts for children', image: { url: 'https://www.fnp.com/assets/images/custom/misc/recepient/Recipient_Kids_Desk_41224.jpg' }, displayOrder: 30 },
            { name: 'Men', category: 'age-gender', emoji: '👨', description: 'Gifts for men', image: { url: 'https://www.fnp.com/assets/images/custom/misc/recepient/Recipient_Men_Desk_41224.jpg' }, displayOrder: 32 },
            { name: 'Women', category: 'age-gender', emoji: '👩', description: 'Gifts for women', image: { url: 'https://www.fnp.com/assets/images/custom/misc/recepient/Recipient_Women_Desk_41224.jpg' }, displayOrder: 33 }
        ];

        const generateSlug = (name) => {
            return name
                .toLowerCase()
                .replace(/[^a-z0-9\s-]/g, '')
                .replace(/\s+/g, '-')
                .replace(/-+/g, '-')
                .trim();
        };

        for (const rawRelation of defaultRelations) {
            const relation = {
                ...rawRelation,
                slug: rawRelation.slug || generateSlug(rawRelation.name)
            };

            await GiftFor.findOneAndUpdate(
                { name: relation.name },
                relation,
                { upsert: true, new: true }
            );
        }

        res.json({ success: true, message: `Seeded ${defaultRelations.length} gift-for relations` });
    } catch (error) {
        console.error('Error seeding gift-for:', error);
        res.status(500).json({ success: false, message: 'Failed to seed gift-for: ' + error.message });
    }
};

// Update product counts for all catalog items
export const updateProductCounts = async (req, res) => {
    try {
        // Update occasion counts
        const occasions = await Occasion.find({});
        for (const occ of occasions) {
            const count = await Product.countDocuments({
                approved: true,
                isAvailable: true,
                occasions: { $in: [occ.name] }
            });
            await Occasion.findByIdAndUpdate(occ._id, { productCount: count });
        }

        // Update state counts
        const states = await State.find({});
        for (const state of states) {
            const safeStateName = escapeRegex(state.name);
            const count = await Product.countDocuments({
                approved: true,
                isAvailable: true,
                state: new RegExp(`^${safeStateName}$`, 'i')
            });
            await State.findByIdAndUpdate(state._id, { productCount: count });
        }

        // Update gift-for counts
        const relations = await GiftFor.find({});
        for (const rel of relations) {
            const count = await Product.countDocuments({
                approved: true,
                isAvailable: true,
                giftFor: { $in: [rel.name] }
            });
            await GiftFor.findByIdAndUpdate(rel._id, { productCount: count });
        }

        res.json({ success: true, message: 'Product counts updated for all catalog items' });
    } catch (error) {
        console.error('Error updating product counts:', error);
        res.status(500).json({ success: false, message: 'Failed to update product counts' });
    }
};
