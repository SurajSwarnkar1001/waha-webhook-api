# WAHA WhatsApp Webhook & MongoDB Receiver API 🚀

Yeh API aapke self-hosted **WAHA (WhatsApp HTTP API)** ke incoming webhook messages ko receive karke **MongoDB** me store karta hai aur **Render** par easily deploy karne ke liye optimized hai.

---

## 📌 Features
- **Render Ready**: `0.0.0.0` host and `process.env.PORT` support.
- **Health Check API**: `/health` endpoint (database status & server uptime check karne ke liye).
- **Webhook Endpoint**: `/webhook` (WAHA ke `message` aur sabhi events handle karne ke liye).
- **Fast 200 OK Response**: WAHA timeout hone se pehle fast acknowledge karta hai aur background me DB save karta hai.
- **Raw + Structured Data**: Message details (`from`, `to`, `body`, `hasMedia`, etc.) ke saath full raw payload save karta hai taaki koi data miss na ho.
- **View Messages API**: `/messages` (Saved messages check karne ke liye with pagination).

---

## 🛠️ Project Structure
```text
waha-api/
├── models/
│   └── Message.js      # Mongoose Schema
├── .env                # Local environment variables
├── .env.example        # Reference environment variables
├── .gitignore          # Git ignores (node_modules, .env)
├── package.json        # Dependencies & scripts
├── server.js           # Express server & routes
└── README.md           # Instructions
```

---

## ⚙️ Step 1: Local Setup & Testing

1. **Dependencies install karein:**
   ```bash
   npm install
   ```

2. **MongoDB Connection String set karein:**
   `.env` file open karein aur apna connection string daalein:
   ```env
   PORT=3000
   MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/waha_whatsapp?retryWrites=true&w=majority
   ```

3. **Server start karein:**
   ```bash
   npm start
   ```

---

## 🌐 Step 2: Render par Deploy karne ka Tarika

1. Code ko apne **GitHub Repository** me push karein:
   ```bash
   git init
   git add .
   git commit -m "initial commit"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo-name>.git
   git push -u origin main
   ```

2. **Render Dashboard** par jaayein ([render.com](https://render.com)):
   - **New +** -> **Web Service** select karein.
   - Apni GitHub repository connect karein.
   - Settings me configure karein:
     - **Name**: `waha-webhook-api` (ya koi bhi naam)
     - **Runtime**: `Node`
     - **Build Command**: `npm install`
     - **Start Command**: `npm start`
   - **Environment Variables** section me add karein:
     - Key: `MONGODB_URI`
     - Value: `<Aapka MongoDB Connection String>`
   - Click **Deploy Web Service**.

3. Deploy hone ke baad Render aapko ek URL dega (Jaise: `https://waha-webhook-api.onrender.com`).

---

## 🔗 Step 3: Self-Hosted WAHA me Webhook URL Add karein

### Option A: WAHA Docker / docker-compose environment me:
Apne WAHA ke `docker-compose.yml` me yeh environment variable set karein:
```yaml
environment:
  - WAHA_WEBHOOK_URL=https://waha-webhook-api.onrender.com/webhook
  - WAHA_WEBHOOK_EVENTS=message,message.any
```

### Option B: WAHA Swagger UI / Dashboard / API se:
WAHA ke Swagger UI (`http://<your-waha-ip>:3000/`) par jaakar `POST /api/sessions/{session}/webhook` call karein ya settings me webhook URL update karein:
```json
{
  "url": "https://waha-webhook-api.onrender.com/webhook",
  "events": ["message", "message.any"]
}
```

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Server & MongoDB connection health check |
| `POST` | `/webhook` | WAHA incoming webhook URL |
| `GET` | `/webhook` | Webhook status test endpoint |
| `GET` | `/messages` | MongoDB me store hue latest WhatsApp messages dekhein |
