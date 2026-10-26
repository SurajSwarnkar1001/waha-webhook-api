# 📖 WAHA WhatsApp Webhook & MongoDB API - Complete Documentation 🚀

Production-ready, highly secure **WhatsApp Webhook Receiver API** jo **Self-Hosted WAHA (WhatsApp HTTP API)** ke incoming messages ko filter karke **MongoDB** me store karta hai aur **Render** cloud par deploy karne ke liye optimized hai.

---

## 📑 Table of Contents (Index)
1. [Architecture & System Flow](#1-architecture--system-flow)
2. [Project File Structure](#2-project-file-structure)
3. [Environment Variables (.env)](#3-environment-variables-env)
4. [Security Layers Explained](#4-security-layers-explained)
5. [MongoDB Data Schema & Format](#5-mongodb-data-schema--format)
6. [API Endpoints Reference](#6-api-endpoints-reference)
7. [Step-by-Step Deployment Guide (Render)](#7-step-by-step-deployment-guide-render)
8. [WAHA Integration & Webhook Configuration](#8-waha-integration--webhook-configuration)
9. [Local Development & Testing](#9-local-development--testing)
10. [Troubleshooting & FAQs](#10-troubleshooting--faqs)

---

## 1. Architecture & System Flow

```text
┌─────────────────┐      WhatsApp Msg      ┌───────────────────────┐
│ WhatsApp User   │ ─────────────────────► │ Self-Hosted WAHA      │
│ (Customer/Chat) │                        │ (NOWEB Engine)        │
└─────────────────┘                        └──────────┬────────────┘
                                                      │
                                          POST /webhook (Instant 200 OK)
                                          + Webhook Secret Check
                                                      ▼
                                           ┌───────────────────────┐
                                           │  Render Webhook API   │
                                           │  - Helmet Security    │
                                           │  - Rate Limiter       │
                                           │  - Clean Data Filter  │
                                           └──────────┬────────────┘
                                                      │
                                                      │ Stores Clean JSON
                                                      ▼
                                           ┌───────────────────────┐
                                           │   MongoDB Atlas       │
                                           │ (Collection: messages)│
                                           └───────────────────────┘
```

---

## 2. Project File Structure

```text
waha-api/
├── models/
│   └── Message.js         # Mongoose Schema (Clean Fields: phone, name, msg, timestamps)
├── .env                   # Local Environment Variables (Git ignored)
├── .env.example           # Template for Environment Variables
├── .gitignore             # Ignores node_modules and .env
├── package.json           # Node dependencies (Express, Mongoose, Helmet, Rate-Limit, Cors)
├── server.js              # Main Express Application, routes & middlewares
└── README.md              # Complete Project Documentation
```

---

## 3. Environment Variables (.env)

| Variable Name | Required? | Example Value | Description |
|---|---|---|---|
| `PORT` | Optional | `3000` | Port on which the API listens. Render automatically sets this to `10000`. |
| `MONGODB_URI` | **Yes** | `mongodb+srv://user:pass@cluster0.xxx.mongodb.net/waha_api?retryWrites=true&w=majority` | MongoDB connection string. `/waha_api` is the database name. |
| `WEBHOOK_SECRET` | Recommended | `waha_secret_token_98765` | Secret token to authenticate incoming requests from WAHA. |
| `ADMIN_API_KEY` | Recommended | `admin_access_key_12345` | Master secret key required to access `/messages` endpoint. |

---

## 4. Security Layers Explained

### 🛡️ Layer 1: Helmet (`helmet`)
- HTTP headers ko secure karta hai.
- Common web vulnerabilities (Cross-Site Scripting, Clickjacking, MIME type sniffing) ko block karta hai.

### 🚦 Layer 2: Rate Limiting (`express-rate-limit`)
- **General Routes (`/` aur `/health`)**: Max **200 requests per 15 minutes**.
- **Webhook Endpoint (`/webhook`)**: Max **150 requests per 1 minute**.
- Faltu bot traffic, DDoS attacks, aur spam loop se server ko crash hone se bachata hai.

### 🔑 Layer 3: Webhook Authentication (`WEBHOOK_SECRET`)
- Sirf wahi requests accept hoti hain jinke paas valid secret token ho.
- Token bhejne ke do tarike hain:
  1. **Query Parameter**: `POST /webhook?secret=waha_secret_token_98765`
  2. **HTTP Header**: `x-api-key: waha_secret_token_98765` ya `Authorization: Bearer waha_secret_token_98765`
- Agar secret match nahi karta, API turant **401 Unauthorized** return karegi.

### 🔒 Layer 4: Admin Access Protection (`ADMIN_API_KEY`)
- `/messages` endpoint par customer ke sensitive WhatsApp messages hote hain.
- Is route ko password-protected banaya gaya hai.
- Access karne ke liye:
  `GET /messages?key=admin_access_key_12345`
  *(Bina key ke open karne par `401 Unauthorized` response aayega).*

---

## 5. MongoDB Data Schema & Format

WAHA ka original raw payload 50+ unnecessary technical parameters bhejta hai (jaise `cappingStatus`, `deviceListMetadata`, `workerId`, etc.). Yeh API un sabko filter karke sirf **essential fields** save karti hai.

### 📱 Real Phone Extraction (LID Fix):
WhatsApp aksar Linked Device ID (`@lid`) bhejta hai (e.g. `252196268552301@lid`). Hamara logic automatically `remoteJidAlt` se real phone number (`916204878067`) nikaal kar store karta hai.

### 📄 Final Document Saved in MongoDB:
```json
{
  "_id": "671df290b3a1a9e84f123456",
  "senderPhone": "916204878067",
  "senderName": "Anju_💝",
  "message": "Hi",
  "fromMe": false,
  "hasMedia": false,
  "mediaUrl": null,
  "messageId": "ACDDDA423E8F95B61865347F627B1769",
  "sentAt": "2026-10-26T14:09:26.000Z",
  "createdAt": "2026-10-26T14:09:26.429Z",
  "updatedAt": "2026-10-26T14:09:26.429Z",
  "__v": 0
}
```

---

## 6. API Endpoints Reference

### 1. Health Check
- **URL**: `GET /health`
- **Auth**: None (Public for monitoring)
- **Response**:
```json
{
  "status": "ok",
  "uptimeSeconds": 120,
  "database": {
    "status": "connected",
    "isConnected": true
  },
  "timestamp": "2026-10-26T14:30:00.000Z"
}
```

### 2. Webhook Ingestion (WAHA)
- **URL**: `POST /webhook?secret=YOUR_WEBHOOK_SECRET`
- **Headers**: `Content-Type: application/json`, `x-api-key: YOUR_WEBHOOK_SECRET` *(optional if in query)*
- **Response**: `200 OK`
```json
{
  "success": true,
  "message": "Webhook received"
}
```

### 3. View Messages (Admin)
- **URL**: `GET /messages?key=YOUR_ADMIN_API_KEY&page=1&limit=20`
- **Auth**: Required (`?key=...` ya `x-api-key: ...`)
- **Query Params**:
  - `page`: Page number (default: 1)
  - `limit`: Number of records (default: 50)
- **Response**:
```json
{
  "success": true,
  "count": 1,
  "total": 45,
  "page": 1,
  "totalPages": 3,
  "messages": [ ... ]
}
```

---

## 7. Step-by-Step Deployment Guide (Render)

1. **GitHub par code push karein:**
   ```bash
   git add .
   git commit -m "feat: complete secured WAHA webhook API"
   git push origin main
   ```

2. **Render.com par jayein:**
   - Click **`+ New`** -> **`Web Service`**.
   - Apna GitHub repository `waha-webhook-api` connect karein.

3. **Service Details set karein:**
   - **Name**: `waha-webhook-api`
   - **Region**: `Singapore` (Fastest for India)
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: `Free`

4. **Environment Variables Add karein:**
   Render me **Environment** tab me jaakar yeh 3 variables add karein:
   - `MONGODB_URI` = `mongodb+srv://<username>:<password>@cluster0.rsubeku.mongodb.net/waha_api?retryWrites=true&w=majority&appName=Cluster0`
   - `WEBHOOK_SECRET` = `waha_secret_token_98765`
   - `ADMIN_API_KEY` = `admin_access_key_12345`

5. Click **Deploy Web Service** & wait for `Live 🎉` status.

---

## 8. WAHA Integration & Webhook Configuration

Render se jo public URL mila hai (e.g. `https://waha-webhook-api.onrender.com`), usko WAHA me configure karein:

### Option A: `docker-compose.yml` me:
```yaml
environment:
  - WAHA_WEBHOOK_URL=https://waha-webhook-api.onrender.com/webhook?secret=waha_secret_token_98765
  - WAHA_WEBHOOK_EVENTS=message,message.any
```

### Option B: WAHA Dashboard / Swagger API se:
WAHA Swagger UI (`http://<your-waha-ip>:3000/`) par:
```json
{
  "url": "https://waha-webhook-api.onrender.com/webhook?secret=waha_secret_token_98765",
  "events": ["message", "message.any"]
}
```

---

## 9. Local Development & Testing

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure `.env` file:**
   Apna actual MongoDB connection string daalein.

3. **Start local server:**
   ```bash
   npm start
   # ya auto-reload ke liye:
   npm run dev
   ```

4. **Curl se test webhook hit karein:**
   ```bash
   curl -X POST "http://localhost:3000/webhook?secret=waha_secret_token_98765" \
     -H "Content-Type: application/json" \
     -d '{
       "event": "message",
       "payload": {
         "id": "test_msg_001",
         "from": "919876543210@c.us",
         "body": "Hello Testing!",
         "timestamp": 1729950000
       }
     }'
   ```

---

## 10. Troubleshooting & FAQs

### Q1: `❌ MongoDB connection error: option waha_api is not supported`
**Solution**: Connection string me `?waha_api=Cluster0` galat hai. Sahi format me database name slash `/` ke baad aata hai:
`/waha_api?retryWrites=true&w=majority&appName=Cluster0`.

### Q2: Webhook response `401 Unauthorized` aa raha hai?
**Solution**: WAHA ke Webhook URL me `?secret=YOUR_TOKEN` check karein ki wo `.env` me diye gaye `WEBHOOK_SECRET` se match kar raha hai ya nahi.

### Q3: `/messages` open karne par `Unauthorized` error?
**Solution**: URL ke end me `?key=YOUR_ADMIN_KEY` lagayein. Example:
`https://your-app.onrender.com/messages?key=admin_access_key_12345`

### Q4: WhatsApp LID ID ke badle asli number kaise save hota hai?
**Solution**: Server ka `extractPhone()` function automatically WhatsApp ke `remoteJidAlt` parameter se 10/12 digit mobile number nikaal leta hai.
