import express from "express";
import {
  addProduct,
  getAllProducts,
  getProductById,
  filterProducts,
  deleteProduct,
  updateProduct,
  createReview,
  getProductReviews,
  getRelatedProducts,
  canUserReview,
  getHomePageCollections,
} from "../controller/productController.js";
import authseller from "../middleware/authseller.js";
import userAuth from "../middleware/userAuth.js";

const router = express.Router();

// Seller-protected routes
router.post('/addproduct', authseller, addProduct);
router.get('/getproducts', authseller, getAllProducts);
router.delete('/deleteproduct/:id', authseller, deleteProduct);
router.put('/updateproduct/:id', authseller, updateProduct);

// Public routes
router.get('/getproduct/:id', getProductById);
router.get('/filter', filterProducts);
router.get("/reviews/:id", getProductReviews);
router.get("/related/:id", getRelatedProducts);
router.get("/home-collections", getHomePageCollections);

// User-protected routes (Issue #53, #54 fix — was missing userAuth)
router.post("/review", userAuth, createReview);
router.get("/can-review", userAuth, canUserReview);

export default router;
