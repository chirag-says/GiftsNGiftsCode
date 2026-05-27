import mongoose from "mongoose";

/**
 * MongoDB Connection Configuration
 * 
 * Issue #36 fix: Exponential backoff retry (3 attempts max).
 * 
 * Why 3 retries, not infinite:
 * - Transient failures (DNS blip, Atlas maintenance): caught by retries
 * - Configuration errors (wrong URL, expired creds): fail fast, don't waste resources
 * - 1s → 3s → 9s covers most transient windows
 * 
 * SECURITY: Never log connection strings as they contain credentials
 */
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000; // 1 second, exponential: 1s, 3s, 9s

const connectDB = async () => {
    mongoose.connection.on('connected', () => {
        console.log("✅ Database Connected Successfully");
    });

    mongoose.connection.on('error', (err) => {
        console.error("❌ Database Connection Error:", err.message);
    });

    // Reconnect handler for production resilience
    mongoose.connection.on('disconnected', () => {
        console.warn("⚠️ Database disconnected. Mongoose will attempt to reconnect.");
    });

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            await mongoose.connect(process.env.mongodb_url);
            return; // Success — exit
        } catch (error) {
            if (attempt === MAX_RETRIES) {
                console.error(`❌ Failed to connect to MongoDB after ${MAX_RETRIES} attempts:`, error.message);
                process.exit(1);
            }

            const delay = BASE_DELAY_MS * Math.pow(3, attempt - 1); // 1s, 3s, 9s
            console.warn(`⚠️ MongoDB connection attempt ${attempt}/${MAX_RETRIES} failed. Retrying in ${delay / 1000}s...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
};

export default connectDB;