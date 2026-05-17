import express from "express";
import { secureUpload } from "../middleware/multer.js";
import Product from "../model/addproduct.js";
import authseller from "../middleware/authseller.js";

const router = express.Router();

// Upload up to 5 images for a product (Issue #12 fix — uses secureUpload with magic byte verification)
router.post("/uploads", authseller, ...secureUpload.array("images", 5), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: "No images uploaded." });
    }

    // Convert filenames → relative URLs
    const imagePaths = req.files.map((file) => `uploads/products/${file.filename}`);

    // Save product images to DB
    const savedImage = await Product.create({ images: imagePaths });

    res.json({
      success: true,
      message: "Images uploaded and saved successfully!",
      document: savedImage,
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ success: false, message: "Error uploading images" });
  }
});

export default router;
