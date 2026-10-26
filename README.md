# WAHA WhatsApp Webhook & MongoDB Integration API 🚀

A production-ready, highly secure **WhatsApp Webhook Receiver and Auto-Responder API** built with **Node.js, Express, and MongoDB**. Designed specifically for self-hosted **WAHA (WhatsApp HTTP API)** instances and optimized for one-click deployment on **Render**.

---

## 📑 Table of Contents
- [Overview](#overview)
- [Key Features](#key-features)
- [System Architecture](#system-architecture)
- [Project Directory Structure](#project-directory-structure)
- [Environment Variables](#environment-variables)
- [Security Layers](#security-layers)
- [MongoDB Data Schema](#mongodb-data-schema)
- [Custom Auto-Reply Bot](#custom-auto-reply-bot)
- [API Endpoints Reference](#api-endpoints-reference)
- [Step-by-Step Render Deployment Guide](#step-by-step-render-deployment-guide)
- [WAHA Webhook Configuration](#waha-webhook-configuration)
- [Local Development & Testing](#local-development--testing)
- [Troubleshooting & FAQs](#troubleshooting--faqs)

---

## Overview

When running a self-hosted WAHA instance, incoming WhatsApp messages and status events are dispatched via HTTP webhooks. This service listens to these webhooks, validates request authenticity, strips away bulky technical engine metadata, extracts real phone numbers and message content, saves the sanitized messages into MongoDB, and optionally sends automated contextual replies (such as introducing Suraj's Bot with portfolio links).

---

## Key Features

- **Render Ready**: Optimized for cloud platforms with `0.0.0.0` host binding and dynamic `PORT` resolution.
- **Fast 200 OK Acknowledgment**: Acknowledges WAHA webhook events immediately to prevent timeout retries, then processes and saves data asynchronously.
- **Clean Data Extraction**: Filters out unnecessary internal metadata (e.g., `deviceListMetadata`, `tier`, `cappingStatus`) to keep database storage compact and fast.
- **LID to Phone Number Resolution**: Automatically resolves WhatsApp Linked Device IDs (`@lid`) into true standard phone numbers using `remoteJidAlt`.
- **Suraj's Portfolio Auto-Reply**: Contextual bot that triggers specifically on greeting messages ("Hi", "Hii", "Hello", "Hey") and shares portfolio links while ignoring other messages.
- **Outbound Messaging API**: Provides a secure `POST /send-message` endpoint to send custom WhatsApp messages on demand.
- **Multi-Layer Security**: Protected by Helmet HTTP headers, rate limiting (DDoS/spam mitigation), strict Webhook Secret verification, and Admin API Key authorization.
- **Health Check Endpoint**: Includes `/health` for zero-downtime monitoring and Render health probes.

---

## System Architecture

```text
┌─────────────────┐       WhatsApp Message       ┌────────────────────────┐
│  WhatsApp User  │ ───────────────────────────► │   Self-Hosted WAHA     │
│ (Customer/Chat) │                              │   (NOWEB Engine)       │
└─────────────────┘                              └───────────┬────────────┘
                                                             │
                                                  POST /webhook?secret=...
                                                  (Immediate 200 OK)
                                                             ▼
                                                 ┌────────────────────────┐
                                                 │   Render Webhook API   │
                                                 │   - Helmet Security    │
                                                 │   - Rate Limiter       │
                                                 │   - Secret Validation  │
                                                 │   - Data Sanitization  │
                                                 └─────┬────────────┬─────┘
                                                       │            │
                                       Stores Document │            │ Outbound Auto-Reply
                                                       ▼            ▼ (Triggered on "Hi")
                                             ┌─────────────┐   ┌─────────────┐
                                             │   MongoDB   │   │  WhatsApp   │
                                             │    Atlas    │   │  Customer   │
                                             └─────────────┘   └─────────────┘
```

---

## Project Directory Structure

```text
waha-api/
├── models/
│   └── Message.js         # Mongoose schema for clean WhatsApp messages
├── .env                   # Local environment variables (git-ignored)
├── .env.example           # Reference template for environment variables
├── .gitignore             # Specifies intentionally untracked files
├── package.json           # Node.js dependencies and operational scripts
├── server.js              # Express application, routes, and security middleware
└── README.md              # Project documentation
```

---

## Environment Variables

All variables should be configured in your local `.env` file and inside **Render Dashboard > Environment**:

| Variable Name | Required | Default Value | Description |
|---|:---:|---|---|
| `PORT` | Optional | `3000` | Port on which the Express server listens. Render sets this dynamically. |
| `MONGODB_URI` | **Yes** | — | MongoDB Atlas connection string (e.g., `mongodb+srv://<username>:<password>@cluster0.xxxxxxx.mongodb.net/waha_api?retryWrites=true&w=majority&appName=Cluster0`). |
| `WEBHOOK_SECRET` | **Yes** | — | Secret token required to authenticate incoming requests from WAHA. |
| `ADMIN_API_KEY` | **Yes** | — | Master API key required to view `/messages` and send messages via `/send-message`. |
| `WAHA_BASE_URL` | **Yes** | `http://xxxxxxxxxxxxxxxxxxxx:3000` | Host URL of your self-hosted WAHA instance for outbound messaging. |
| `WAHA_API_KEY` | Optional | — | API key for authenticating requests to your WAHA server (passed in `X-Api-Key` header). |
| `WAHA_SESSION` | Optional | `default` | WAHA WhatsApp session name. |

---

## Security Layers

### 1. HTTP Security Headers (`helmet`)
Protects against well-known web attack vectors including Cross-Site Scripting (XSS), clickjacking, sniffing attacks, and cross-site injection.

### 2. Rate Limiting (`express-rate-limit`)
- **Public & Management Endpoints (`/`, `/health`, `/messages`)**: Maximum **200 requests per 15 minutes** per IP.
- **Webhook Ingestion Endpoint (`/webhook`)**: Maximum **150 requests per minute** per IP.
Protects the API from denial-of-service (DDoS) loops and malicious spam floods.

### 3. Webhook Secret Token (`WEBHOOK_SECRET`)
- Only authorized requests originating from your WAHA server are permitted.
- Can be passed as:
  - Query parameter: `POST /webhook?secret=YOUR_TOKEN`
  - HTTP header: `x-api-key: YOUR_TOKEN` or `Authorization: Bearer YOUR_TOKEN`
- If the token is missing or mismatched, the request is immediately rejected with `401 Unauthorized`.

### 4. Admin API Key Protection (`ADMIN_API_KEY`)
- Prevents public inspection of private customer conversations stored under `/messages`.
- Required when triggering outbound messages via `/send-message`.
- Passed via query parameter `?key=YOUR_KEY` or HTTP header `x-api-key: YOUR_KEY`.

---

## MongoDB Data Schema

Raw WAHA payloads contain extensive internal debug information. This API extracts only meaningful business fields and stores them in MongoDB:

```json
{
  "_id": "671df290b3a1a9e84f123456",
  "senderPhone": "91xxxxxxxxxx",
  "senderName": "Dummy User",
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

### Field Breakdown:
- `senderPhone` (`String`): Sender's actual phone number (e.g., `91xxxxxxxxxx`), cleanly extracted from `remoteJidAlt`.
- `senderName` (`String`): WhatsApp display/push name (e.g., `Dummy User`).
- `message` (`String`): Text body of the message.
- `fromMe` (`Boolean`): `false` for incoming customer messages; `true` for messages sent by the bot/account.
- `hasMedia` (`Boolean`): Flag indicating if media (photo, voice, video, document) was attached.
- `mediaUrl` (`String`): URL of attachment if present.
- `messageId` (`String`): WhatsApp unique message ID.
- `sentAt` (`Date`): Timestamp generated by WhatsApp when the message was sent.

---

## Custom Auto-Reply Bot

The webhook includes intelligent auto-reply logic tailored for Suraj's personal brand:

1. **Trigger Condition**:
   - The message must be incoming (`fromMe === false`).
   - The message text must match greeting patterns: `"hi"`, `"hii"`, `"hiii"`, `"hello"`, or `"hey"` (case-insensitive).
2. **Behavior on Trigger**:
   - Sends the following formatted WhatsApp reply back to the user:
     ```text
     Hello [Sender Name]! 👋

     Main *Suraj ka Bot* hoon 🤖
     I give you a reply for *Hi* messages only! 😉

     Suraj ke baare me aur jaanne ya unka work dekhne ke liye portfolio check karein:
     🌐 *Portfolio:* https://suraj-swarnkar.onrender.com/

     Aapka message Suraj tak pahuch gaya hai, wo aapse jald hi yahan connect karenge! ✨
     ```
3. **Anti-Spam Cooldown Protection**:
   - If a user sends multiple greetings consecutively (e.g. `"Hi"`, `"Hii"` 5 times in a row), the bot replies **only once**.
   - A **10-minute cooldown** (`AUTO_REPLY_COOLDOWN_MINUTES`) is placed on that sender's number. Duplicate greeting messages within this window are safely saved in MongoDB, but duplicate replies are suppressed.
4. **Behavior on Other Messages**:
   - If the user sends anything else (e.g., "what is the price", "call me", etc.), the message is safely stored in MongoDB, and **no automatic reply is dispatched**.


---

## API Endpoints Reference

### 1. Root Information
- **Method**: `GET`
- **Path**: `/`
- **Auth**: None
- **Response**:
```json
{
  "name": "WAHA WhatsApp Webhook API",
  "status": "online",
  "healthCheck": "/health",
  "webhookEndpoint": "/webhook",
  "recentMessages": "/messages",
  "timestamp": "2026-10-26T15:00:00.000Z"
}
```

### 2. Health Check
- **Method**: `GET`
- **Path**: `/health`
- **Auth**: None (Used by Render and monitoring bots)
- **Response**:
```json
{
  "status": "ok",
  "uptimeSeconds": 360,
  "database": {
    "status": "connected",
    "isConnected": true
  },
  "timestamp": "2026-10-26T15:00:00.000Z"
}
```

### 3. Ingest Webhook (WAHA)
- **Method**: `POST`
- **Path**: `/webhook?secret=YOUR_WEBHOOK_SECRET`
- **Auth**: Required (`?secret=...` or `x-api-key: ...`)
- **Response**:
```json
{
  "success": true,
  "message": "Webhook received"
}
```

### 4. View Stored Messages (Admin)
- **Method**: `GET`
- **Path**: `/messages?key=YOUR_ADMIN_API_KEY&page=1&limit=20`
- **Auth**: Required (`?key=...` or `x-api-key: ...`)
- **Query Parameters**:
  - `page`: Page number (default: 1)
  - `limit`: Number of records to return (default: 50)
- **Response**:
```json
{
  "success": true,
  "count": 1,
  "total": 45,
  "page": 1,
  "totalPages": 3,
  "messages": [
    {
      "_id": "671df290b3a1a9e84f123456",
      "senderPhone": "91xxxxxxxxxx",
      "senderName": "Dummy User",
      "message": "Hi",
      "fromMe": false,
      "hasMedia": false,
      "sentAt": "2026-10-26T14:09:26.000Z"
    }
  ]
}
```

### 5. Send Outbound Message (Admin)
- **Method**: `POST`
- **Path**: `/send-message?key=YOUR_ADMIN_API_KEY`
- **Auth**: Required (`?key=...` or `x-api-key: ...`)
- **Headers**: `Content-Type: application/json`
- **Request Body**:
```json
{
  "phone": "91xxxxxxxxxx",
  "message": "Hello! Your inquiry has been received."
}
```
- **Response**:
```json
{
  "success": true,
  "message": "Message sent successfully to 91xxxxxxxxxx"
}
```

---

## Step-by-Step Render Deployment Guide

1. **Commit and Push Your Code to GitHub**:
   ```bash
   git add .
   git commit -m "feat: complete secured WAHA webhook API with portfolio bot"
   git push origin main
   ```

2. **Create New Web Service on Render**:
   - Log into [Render Dashboard](https://dashboard.render.com/).
   - Click **`+ New`** > **`Web Service`**.
   - Connect your GitHub repository (`waha-webhook-api`).

3. **Configure Service Settings**:
   - **Name**: `waha-webhook-api`
   - **Region**: `Singapore` (or region closest to your WAHA server)
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: `Free`

4. **Set Environment Variables in Render**:
   Under the **Environment** tab, add the following key-value pairs:
   - `MONGODB_URI` = `mongodb+srv://<username>:<password>@cluster0.xxxxxxx.mongodb.net/waha_api?retryWrites=true&w=majority&appName=Cluster0`
   - `WEBHOOK_SECRET` = `xxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
   - `ADMIN_API_KEY` = `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
   - `WAHA_BASE_URL` = `http://xxxxxxxxxxxxxxxxxxxxxxxxxx:3000`
   - `WAHA_API_KEY` = `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
   - `WAHA_SESSION` = `default`

5. Click **Deploy Web Service** and wait for the status to show **`Live 🎉`**.
   Your service will be available at: `https://<your-app-name>.onrender.com`.

---

## WAHA Webhook Configuration

Connect your self-hosted WAHA instance to your newly deployed Render API.

### Option A: Via Docker Compose
Add these environment variables to your WAHA container definition in `docker-compose.yml`:
```yaml
environment:
  - WAHA_WEBHOOK_URL=https://<your-app-name>.onrender.com/webhook?secret=xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
  - WAHA_WEBHOOK_EVENTS=message,message.any
```

### Option B: Via WAHA Dashboard / Swagger UI
1. Navigate to your WAHA Swagger UI: `http://xxxxxxxxxxxxxxxxxxxx:3000/`.
2. Locate the Webhook configuration under session settings.
3. Configure the webhook destination:
   ```json
   {
     "url": "https://<your-app-name>.onrender.com/webhook?secret=xxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
     "events": ["message", "message.any"]
   }
   ```

---

## Local Development & Testing

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Configure Local Environment**:
   Duplicate `.env.example` into `.env` and fill in your connection strings and tokens:
   ```bash
   cp .env.example .env
   ```

3. **Start the Application**:
   ```bash
   npm start
   # Or with hot-reloading:
   npm run dev
   ```

4. **Simulate an Incoming Webhook (cURL)**:
   ```bash
   curl -X POST "http://localhost:3000/webhook?secret=xxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
     -H "Content-Type: application/json" \
     -d '{
       "event": "message",
       "session": "default",
       "payload": {
         "id": "test_message_123",
         "from": "91xxxxxxxxxx@c.us",
         "body": "Hi",
         "timestamp": 1729950000,
         "_data": {
           "pushName": "Test User",
           "key": {
             "remoteJidAlt": "91xxxxxxxxxx@s.whatsapp.net"
           }
         }
       }
     }'
   ```

---

## Troubleshooting & FAQs

### 1. `❌ MongoDB connection error: option waha_api is not supported`
- **Cause**: The database name was incorrectly passed as a query string parameter (`?waha_api=Cluster0`).
- **Fix**: Place the database name immediately after the slash `/` before query parameters:
  `...mongodb.net/waha_api?retryWrites=true&w=majority&appName=Cluster0`.

### 2. `401 Unauthorized` on `/webhook`
- **Cause**: The webhook request is missing the secret token or it does not match `WEBHOOK_SECRET`.
- **Fix**: Verify that the WAHA webhook destination URL contains `?secret=<your_token>` and that it exactly matches the `WEBHOOK_SECRET` value defined in Render's environment variables.

### 3. `401 Unauthorized` on `/messages` or `/send-message`
- **Cause**: Missing or invalid `ADMIN_API_KEY`.
- **Fix**: Append `?key=<your_admin_key>` to the URL or include the `x-api-key: <your_admin_key>` header in your HTTP request.

### 4. WhatsApp sends `@lid` instead of a mobile number
- **Resolution**: This API automatically parses `remoteJidAlt` inside WhatsApp's metadata to capture the real mobile phone number (e.g., `91xxxxxxxxxx`).

---

## License

This project is licensed under the ISC License.
