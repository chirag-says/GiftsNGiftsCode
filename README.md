# 🎁 GiftsNGifts

GiftsNGifts is a comprehensive, multi-vendor e-commerce platform designed exclusively for personalized and curated gifting. The platform seamlessly connects artisans, bulk suppliers, and individual sellers with customers looking for unique, customizable gifts.

## 🏗️ Architecture

This is a full-stack **MERN** (MongoDB, Express, React, Node.js) monorepo divided into four core applications:

- **Client (`/Client`)**: The public-facing e-commerce storefront where customers can browse, customize, and purchase gifts.
- **Seller Panel (`/Seller`)**: A dedicated dashboard for vendors to manage their inventory, track orders, handle refunds, and view earnings.
- **Admin Panel (`/Admin`)**: The central command center for platform administrators to moderate sellers, approve products, and manage site analytics.
- **Server API (`/Server`)**: The unified Node.js backend powering all three frontend applications, handling authentication, payments, database interactions, and email notifications.

## 🚀 Tech Stack

- **Frontend:** React.js, Vite, TailwindCSS
- **Backend:** Node.js, Express.js
- **Database:** MongoDB (Mongoose)
- **Payments:** Razorpay Integration
- **Storage:** Cloudinary (for product images & personalization uploads)
- **Authentication:** JWT (JSON Web Tokens) with secure cookies
- **Emails:** Nodemailer (SMTP Connection Pooling)

## 🛠️ Local Development Setup

### 1. Prerequisites
Ensure you have the following installed on your machine:
- Node.js (v20+)
- npm or yarn
- Git

### 2. Environment Configuration
You will need to create `.env` files in all four directories (`Server`, `Client`, `Seller`, `Admin`). 
Use the `.env.example` files (if provided) as a template. You will need API keys for:
- MongoDB URI
- JWT Secrets
- Razorpay Key ID & Secret
- Cloudinary Credentials
- SMTP Credentials

### 3. Installation & Running

Open separate terminal windows for the backend and the frontends you wish to run:

**Backend (Server)**
```bash
cd Server
npm install
npm run dev
# Runs on http://localhost:7000
```

**Client Storefront**
```bash
cd Client
npm install
npm run dev
# Runs on http://localhost:5173
```

**Seller Panel**
```bash
cd Seller
npm install
npm run dev
# Runs on http://localhost:5174
```

**Admin Panel**
```bash
cd Admin
npm install
npm run dev
# Runs on http://localhost:5175
```

## 🛡️ Security Features
- **Strict Rate Limiting:** Brute-force protection on authentication routes.
- **IDOR Protection:** Robust middleware ensuring users/sellers can only access their own data.
- **Atomic Transactions:** Payment capture and order creation are inextricably linked with webhook fallbacks.
- **File Validation:** Magic-byte validation on image uploads to prevent malicious payloads.

## 📄 License
This project is proprietary and confidential. Unauthorized copying, distribution, or use is strictly prohibited.
