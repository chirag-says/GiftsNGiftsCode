import mongoose from 'mongoose';
import Product from '../model/addproduct.js';
import Category from '../model/Category.js';
// Import Subcategory to register the model (fixes the MissingSchemaError)
import Subcategory from '../model/Subcategory.js';

// ============================================
// NATURAL LANGUAGE QUERY PARSER
// ============================================

// Common color keywords
const COLORS = [
    'red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'black',
    'white', 'grey', 'gray', 'brown', 'gold', 'silver', 'navy', 'maroon',
    'beige', 'cream', 'teal', 'coral', 'lavender', 'mint', 'peach', 'burgundy'
];

// Common size keywords
const SIZES = ['xs', 'small', 's', 'medium', 'm', 'large', 'l', 'xl', 'xxl', 'xxxl', 'free size'];

// Price pattern extractors
const PRICE_PATTERNS = [
    // "under 500", "under ₹500", "below 500"
    { regex: /(?:under|below|less than|max|upto|up to)\s*(?:₹|rs\.?|inr)?\s*(\d+)/i, type: 'max' },
    // "above 500", "over ₹500", "more than 500"
    { regex: /(?:above|over|more than|min|starting|from)\s*(?:₹|rs\.?|inr)?\s*(\d+)/i, type: 'min' },
    // "between 500 and 1000", "500-1000", "₹500 to ₹1000"
    { regex: /(?:between\s*)?(?:₹|rs\.?|inr)?\s*(\d+)\s*(?:to|-|and)\s*(?:₹|rs\.?|inr)?\s*(\d+)/i, type: 'range' },
    // "around 500", "approx 500"
    { regex: /(?:around|approx|approximately|~)\s*(?:₹|rs\.?|inr)?\s*(\d+)/i, type: 'around' }
];

// Sort keywords
const SORT_KEYWORDS = {
    'cheapest': { price: 1 },
    'lowest price': { price: 1 },
    'cheap': { price: 1 },
    'affordable': { price: 1 },
    'budget': { price: 1 },
    'expensive': { price: -1 },
    'highest price': { price: -1 },
    'premium': { price: -1 },
    'luxury': { price: -1 },
    'newest': { createdAt: -1 },
    'latest': { createdAt: -1 },
    'new arrivals': { createdAt: -1 },
    'popular': { isFeatured: -1 },
    'best': { isFeatured: -1 },
    'featured': { isFeatured: -1 },
    'top rated': { isFeatured: -1 }
};

// In-stock filter keywords
const AVAILABILITY_KEYWORDS = ['in stock', 'available', 'available now'];

// Extended stop words - words to filter out from search
const STOP_WORDS = [
    'show', 'me', 'find', 'search', 'for', 'i', 'want', 'need', 'looking',
    'get', 'buy', 'purchase', 'the', 'a', 'an', 'some', 'any', 'with',
    'please', 'can', 'you', 'do', 'have', 'products', 'items', 'things',
    'to', 'of', 'in', 'on', 'at', 'by', 'from', 'up', 'about', 'into',
    'through', 'during', 'before', 'after', 'above', 'below', 'between',
    'but', 'and', 'or', 'if', 'then', 'because', 'as', 'until', 'while',
    'would', 'like', 'could', 'should', 'might', 'must', 'shall', 'will',
    'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'has', 'had', 'having', 'does', 'did', 'doing',
    'this', 'that', 'these', 'those', 'what', 'which', 'who', 'whom',
    'my', 'your', 'his', 'her', 'its', 'our', 'their', 'myself', 'yourself',
    'something', 'anything', 'nothing', 'everything', 'someone', 'anyone',
    'give', 'gave', 'given', 'see', 'look', 'looking', 'want', 'wanted'
];

/**
 * Parse a natural language query into structured search parameters
 */
const parseSearchQuery = (query) => {
    const normalized = query.toLowerCase().trim();
    const result = {
        searchTerms: [],
        priceFilter: null,
        colors: [],
        sizes: [],
        sort: null,
        inStockOnly: false,
        originalQuery: query
    };

    let workingQuery = normalized;

    // Extract price filters
    for (const pattern of PRICE_PATTERNS) {
        const match = workingQuery.match(pattern.regex);
        if (match) {
            if (pattern.type === 'max') {
                result.priceFilter = { max: parseInt(match[1]) };
            } else if (pattern.type === 'min') {
                result.priceFilter = { min: parseInt(match[1]) };
            } else if (pattern.type === 'range') {
                result.priceFilter = { min: parseInt(match[1]), max: parseInt(match[2]) };
            } else if (pattern.type === 'around') {
                const value = parseInt(match[1]);
                result.priceFilter = { min: Math.floor(value * 0.8), max: Math.ceil(value * 1.2) };
            }
            workingQuery = workingQuery.replace(match[0], ' ');
            break;
        }
    }

    // Extract colors
    for (const color of COLORS) {
        const colorRegex = new RegExp(`\\b${color}\\b`, 'i');
        if (colorRegex.test(workingQuery)) {
            result.colors.push(color);
            workingQuery = workingQuery.replace(colorRegex, ' ');
        }
    }

    // Extract sizes
    for (const size of SIZES) {
        const sizeRegex = new RegExp(`\\b${size}\\b`, 'i');
        if (sizeRegex.test(workingQuery)) {
            result.sizes.push(size);
            workingQuery = workingQuery.replace(sizeRegex, ' ');
        }
    }

    // Extract sort preference
    for (const [keyword, sortValue] of Object.entries(SORT_KEYWORDS)) {
        if (workingQuery.includes(keyword)) {
            result.sort = sortValue;
            workingQuery = workingQuery.replace(keyword, ' ');
            break;
        }
    }

    // Check for availability keywords
    for (const keyword of AVAILABILITY_KEYWORDS) {
        if (workingQuery.includes(keyword)) {
            result.inStockOnly = true;
            workingQuery = workingQuery.replace(keyword, ' ');
        }
    }

    // Clean up and extract remaining search terms
    const terms = workingQuery
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(term => term.length > 1 && !STOP_WORDS.includes(term));

    // Apply basic stemming - add singular versions for plurals
    const expandedTerms = [];
    for (const term of terms) {
        expandedTerms.push(term);

        // Handle common plural endings
        if (term.endsWith('ies') && term.length > 4) {
            // e.g., "candies" -> "candy"
            expandedTerms.push(term.slice(0, -3) + 'y');
        } else if (term.endsWith('es') && term.length > 3) {
            // e.g., "watches" -> "watch", "boxes" -> "box"
            expandedTerms.push(term.slice(0, -2));
            expandedTerms.push(term.slice(0, -1)); // Also try just removing 's'
        } else if (term.endsWith('s') && term.length > 3 && !term.endsWith('ss')) {
            // e.g., "cakes" -> "cake", "gifts" -> "gift"
            expandedTerms.push(term.slice(0, -1));
        }
    }

    // Remove duplicates
    result.searchTerms = [...new Set(expandedTerms)];

    return result;
};

/**
 * Build MongoDB query from parsed search parameters
 * Uses OR logic for flexible matching
 */
const buildMongoQuery = async (parsed) => {
    const query = { approved: true };
    const orConditions = [];

    // Text search for search terms - use OR logic so ANY term can match
    if (parsed.searchTerms.length > 0) {
        const termConditions = parsed.searchTerms.map(term => ({
            $or: [
                { title: { $regex: term, $options: 'i' } },
                { description: { $regex: term, $options: 'i' } },
                { brand: { $regex: term, $options: 'i' } },
                { genericName: { $regex: term, $options: 'i' } },
                { aboutThisItem: { $regex: term, $options: 'i' } }
            ]
        }));

        // Use OR for search terms (more flexible matching)
        orConditions.push({ $or: termConditions });
    }

    // Color search (in title, description, or size field)
    if (parsed.colors.length > 0) {
        const colorConditions = parsed.colors.map(color => ({
            $or: [
                { title: { $regex: color, $options: 'i' } },
                { description: { $regex: color, $options: 'i' } },
                { size: { $regex: color, $options: 'i' } }
            ]
        }));
        orConditions.push({ $or: colorConditions });
    }

    // Size search
    if (parsed.sizes.length > 0) {
        const sizeConditions = parsed.sizes.map(size => ({
            size: { $regex: size, $options: 'i' }
        }));
        orConditions.push({ $or: sizeConditions });
    }

    // Price filter - always apply as AND condition
    if (parsed.priceFilter) {
        const priceCondition = {};
        if (parsed.priceFilter.min !== undefined) {
            priceCondition.$gte = parsed.priceFilter.min;
        }
        if (parsed.priceFilter.max !== undefined) {
            priceCondition.$lte = parsed.priceFilter.max;
        }
        if (Object.keys(priceCondition).length > 0) {
            query.price = priceCondition;
        }
    }

    // In-stock filter
    if (parsed.inStockOnly) {
        query.isAvailable = true;
        query.stock = { $gt: 0 };
    }

    // Combine conditions with OR for flexible matching
    if (orConditions.length > 0) {
        if (orConditions.length === 1) {
            query.$or = orConditions[0].$or;
        } else {
            // When we have both search terms and colors, use AND between categories
            query.$and = orConditions;
        }
    }

    return query;
};

/**
 * Search products with intelligent query parsing
 */
export const searchProducts = async (userQuery, options = {}) => {
    const { limit = 5, userId = null } = options;

    try {
        // Parse the natural language query
        const parsed = parseSearchQuery(userQuery);

        console.log('[ProductSearch] Parsed query:', JSON.stringify(parsed, null, 2));

        // If no meaningful search terms, return empty to trigger trending fallback
        if (parsed.searchTerms.length === 0 && parsed.colors.length === 0 && !parsed.priceFilter) {
            console.log('[ProductSearch] No meaningful search terms found');
            return {
                success: true,
                products: [],
                totalFound: 0,
                parsed
            };
        }

        // Build MongoDB query
        const mongoQuery = await buildMongoQuery(parsed);

        console.log('[ProductSearch] MongoDB query:', JSON.stringify(mongoQuery, null, 2));

        // Determine sort order
        const sortOrder = parsed.sort || { isFeatured: -1, createdAt: -1 };

        // Execute search - only populate category (not subcategory to avoid errors)
        const products = await Product.find(mongoQuery)
            .populate('categoryname', 'categoryname')
            .sort(sortOrder)
            .limit(limit)
            .lean();

        console.log('[ProductSearch] Found', products.length, 'products');

        // Format results for chatbot
        const formattedProducts = products.map(product => {
            // Calculate isAvailable reliably - check multiple fields
            const stockCount = parseInt(product.stock) || 0;
            const reservedStock = parseInt(product.reservedStock) || 0;
            const availableStock = stockCount - reservedStock;

            // isAvailable is true if: stock > 0 OR isAvailable flag is true OR availability is "In Stock"/"Low Stock"
            const inStock = availableStock > 0 ||
                product.isAvailable === true ||
                (product.availability && product.availability !== 'Out of Stock');

            return {
                _id: product._id,
                title: product.title,
                price: product.price,
                oldPrice: product.oldprice,
                discount: product.discount,
                image: product.images?.[0]?.url || null,
                brand: product.brand || null,
                category: product.categoryname?.categoryname || null,
                availability: product.availability,
                isAvailable: inStock,
                stock: availableStock > 10 ? 'In Stock' : availableStock > 0 ? 'Low Stock' : 'Out of Stock'
            };
        });

        return {
            success: true,
            products: formattedProducts,
            totalFound: products.length,
            parsed: {
                searchTerms: parsed.searchTerms,
                priceFilter: parsed.priceFilter,
                colors: parsed.colors,
                sort: parsed.sort ? Object.keys(parsed.sort)[0] : null
            }
        };

    } catch (error) {
        console.error('[ProductSearch] Error:', error);
        return {
            success: false,
            products: [],
            error: error.message
        };
    }
};

/**
 * Get product recommendations based on category or browsing history
 */
export const getProductRecommendations = async (options = {}) => {
    const { categoryId = null, excludeIds = [], limit = 4 } = options;

    try {
        const query = {
            approved: true,
            isAvailable: true,
            stock: { $gt: 0 }
        };

        if (categoryId) {
            query.categoryname = categoryId;
        }

        if (excludeIds.length > 0) {
            query._id = { $nin: excludeIds.map(id => new mongoose.Types.ObjectId(id)) };
        }

        const products = await Product.find(query)
            .populate('categoryname', 'categoryname')
            .sort({ isFeatured: -1, createdAt: -1 })
            .limit(limit)
            .lean();

        return products.map(product => {
            const stockCount = parseInt(product.stock) || 0;
            const reservedStock = parseInt(product.reservedStock) || 0;
            const availableStock = stockCount - reservedStock;
            const inStock = availableStock > 0 ||
                product.isAvailable === true ||
                (product.availability && product.availability !== 'Out of Stock');

            return {
                _id: product._id,
                title: product.title,
                price: product.price,
                oldPrice: product.oldprice,
                discount: product.discount,
                image: product.images?.[0]?.url || null,
                brand: product.brand || null,
                category: product.categoryname?.categoryname || null,
                isAvailable: inStock,
                stock: availableStock > 10 ? 'In Stock' : availableStock > 0 ? 'Low Stock' : 'Out of Stock'
            };
        });

    } catch (error) {
        console.error('[ProductRecommendations] Error:', error);
        return [];
    }
};

/**
 * Get trending/featured products
 */
export const getTrendingProducts = async (limit = 4) => {
    try {
        // First try featured products
        let products = await Product.find({
            approved: true,
            isAvailable: true,
            isFeatured: true
        })
            .populate('categoryname', 'categoryname')
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();

        // If no featured products, get latest available ones
        if (products.length === 0) {
            products = await Product.find({
                approved: true,
                isAvailable: true
            })
                .populate('categoryname', 'categoryname')
                .sort({ createdAt: -1 })
                .limit(limit)
                .lean();
        }

        // If still no products, get any approved products
        if (products.length === 0) {
            products = await Product.find({ approved: true })
                .populate('categoryname', 'categoryname')
                .sort({ createdAt: -1 })
                .limit(limit)
                .lean();
        }

        return products.map(product => {
            const stockCount = parseInt(product.stock) || 0;
            const reservedStock = parseInt(product.reservedStock) || 0;
            const availableStock = stockCount - reservedStock;
            const inStock = availableStock > 0 ||
                product.isAvailable === true ||
                (product.availability && product.availability !== 'Out of Stock');

            return {
                _id: product._id,
                title: product.title,
                price: product.price,
                oldPrice: product.oldprice,
                discount: product.discount,
                image: product.images?.[0]?.url || null,
                brand: product.brand || null,
                category: product.categoryname?.categoryname || null,
                isAvailable: inStock,
                stock: availableStock > 10 ? 'In Stock' : availableStock > 0 ? 'Low Stock' : 'Out of Stock'
            };
        });

    } catch (error) {
        console.error('[TrendingProducts] Error:', error);
        return [];
    }
};

/**
 * Get products by category name (for chatbot category browsing)
 */
export const getProductsByCategory = async (categoryName, limit = 5) => {
    try {
        // Find category by name (case-insensitive)
        const category = await Category.findOne({
            categoryname: { $regex: new RegExp(categoryName, 'i') }
        });

        if (!category) {
            return { success: false, message: `Category "${categoryName}" not found`, products: [] };
        }

        const products = await Product.find({
            categoryname: category._id,
            approved: true,
            isAvailable: true
        })
            .populate('categoryname', 'categoryname')
            .sort({ isFeatured: -1, createdAt: -1 })
            .limit(limit)
            .lean();

        return {
            success: true,
            category: category.categoryname,
            products: products.map(product => {
                const stockCount = parseInt(product.stock) || 0;
                const reservedStock = parseInt(product.reservedStock) || 0;
                const availableStock = stockCount - reservedStock;
                const inStock = availableStock > 0 ||
                    product.isAvailable === true ||
                    (product.availability && product.availability !== 'Out of Stock');

                return {
                    _id: product._id,
                    title: product.title,
                    price: product.price,
                    oldPrice: product.oldprice,
                    discount: product.discount,
                    image: product.images?.[0]?.url || null,
                    brand: product.brand || null,
                    isAvailable: inStock,
                    stock: availableStock > 10 ? 'In Stock' : availableStock > 0 ? 'Low Stock' : 'Out of Stock'
                };
            })
        };

    } catch (error) {
        console.error('[ProductsByCategory] Error:', error);
        return { success: false, error: error.message, products: [] };
    }
};

/**
 * Simple keyword search - fallback for when NLP parsing doesn't work well
 */
export const simpleSearch = async (keyword, limit = 5) => {
    try {
        const products = await Product.find({
            approved: true,
            $or: [
                { title: { $regex: keyword, $options: 'i' } },
                { description: { $regex: keyword, $options: 'i' } },
                { brand: { $regex: keyword, $options: 'i' } }
            ]
        })
            .populate('categoryname', 'categoryname')
            .sort({ isFeatured: -1, createdAt: -1 })
            .limit(limit)
            .lean();

        return products.map(product => {
            const stockCount = parseInt(product.stock) || 0;
            const reservedStock = parseInt(product.reservedStock) || 0;
            const availableStock = stockCount - reservedStock;
            const inStock = availableStock > 0 ||
                product.isAvailable === true ||
                (product.availability && product.availability !== 'Out of Stock');

            return {
                _id: product._id,
                title: product.title,
                price: product.price,
                oldPrice: product.oldprice,
                discount: product.discount,
                image: product.images?.[0]?.url || null,
                brand: product.brand || null,
                category: product.categoryname?.categoryname || null,
                isAvailable: inStock,
                stock: availableStock > 10 ? 'In Stock' : availableStock > 0 ? 'Low Stock' : 'Out of Stock'
            };
        });
    } catch (error) {
        console.error('[SimpleSearch] Error:', error);
        return [];
    }
};

export default {
    searchProducts,
    getProductRecommendations,
    getTrendingProducts,
    getProductsByCategory,
    simpleSearch
};