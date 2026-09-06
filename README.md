# FinSync

Personal finance dashboard aggregating banking, investments, and real estate into one place.

---

## Prerequisites

- Node.js v18+
- A MongoDB Atlas account (free tier is fine)
- A Plaid developer account (free sandbox)
- A RentCast API account (free tier)

---

## First-Time Setup

### 1. Install dependencies

```bash
# From the finsync/ root folder:
npm install
cd server && npm install
cd ../client && npm install
cd ..
```

### 2. Create your environment file

```bash
cd server
cp .env.example .env
```

Then open `server/.env` and fill in your keys:

```
PORT=3001
NODE_ENV=development
MONGODB_URI=mongodb+srv://USERNAME:PASSWORD@cluster.mongodb.net/finsync
PLAID_CLIENT_ID=your_plaid_client_id
PLAID_SECRET=your_plaid_sandbox_secret
PLAID_ENV=sandbox
RENTCAST_API_KEY=your_rentcast_api_key
```

### 3. Where to get each key

**MongoDB Atlas (free):**
1. Go to https://mongodb.com/atlas
2. Create a free account → Create a free M0 cluster
3. Click "Connect" → "Drivers" → Copy the connection string
4. Replace `<password>` with your DB user password

**Plaid (free sandbox):**
1. Go to https://dashboard.plaid.com/signup
2. Create a free account
3. Go to Team Settings → Keys
4. Copy your `client_id` and `Sandbox secret`

**RentCast (free tier - 50 calls/month):**
1. Go to https://app.rentcast.io
2. Create a free account
3. Go to API → Copy your API key

---

## Running the App

```bash
# From the finsync/ root folder, run both server and client:
npm run dev
```

This starts:
- **Backend API** → http://localhost:3001
- **Frontend** → http://localhost:5173

Open your browser to **http://localhost:5173**

---

## Using the App

### 1. Login
- Enter your email address (no password needed for now)
- Your data is linked to your email

### 2. Connect Bank Accounts
- Click **"+ Connect Account"** on the Dashboard
- Use Plaid sandbox credentials:
  - Username: `user_good`
  - Password: `pass_good`
- This gives you test accounts with realistic data

### 3. Add Properties
- Click **"+ Add Property"**
- Enter a real address (RentCast will look it up)
- Click **"Add financial details"** to enter rent, mortgage, expenses

### 4. View Analysis
- Click **"Analysis"** in the navbar
- Switch between Banking, Investments, Real Estate tabs
- Click any account to drill into it

---

## Folder Structure

```
finsync/
├── client/                  # React frontend (Vite)
│   └── src/
│       ├── components/      # Navbar, BalanceChart, PropertyInputModal
│       ├── pages/           # Dashboard, Analysis, Login
│       └── services/api.js  # All API calls
│
├── server/                  # Node.js + Express backend
│   ├── config/db.js         # MongoDB connection
│   ├── controllers/         # Business logic
│   ├── models/              # Mongoose schemas
│   ├── routes/              # API routes
│   └── services/            # Plaid, RentCast, snapshot scheduler
│
└── package.json             # Root scripts
```

---

## API Endpoints

```
POST /api/plaid/link-token
POST /api/plaid/exchange-public-token
GET  /api/plaid/accounts?userId=email
GET  /api/plaid/transactions?userId=email&startDate=&endDate=

GET  /api/investments/accounts?userId=email
GET  /api/investments/holdings?userId=email

GET  /api/real-estate/properties?userId=email
POST /api/real-estate/add
PUT  /api/real-estate/property/:id/inputs
POST /api/real-estate/property/:id/refresh
DELETE /api/real-estate/property/:id

GET  /api/balance-history/banking?userId=email&days=90
GET  /api/balance-history/investment?userId=email&days=90
POST /api/balance-history/snapshot-manual  (test cron job)
```

---

## Troubleshooting

**Server won't start:**
- Check `server/.env` exists and has all required values
- Make sure MongoDB URI is correct (test it in MongoDB Compass)

**Plaid errors (400):**
- Sandbox tokens expire after inactivity
- Go to Dashboard → click "Connect Account" → reconnect accounts

**RentCast not finding property:**
- Make sure address format is correct (e.g. "123 Main St", "New York", "NY")
- Check your API key in `.env`
- Check RentCast dashboard for remaining API calls (50/month free)

**Charts show no data:**
- Balance history requires at least 1 snapshot
- Snapshots save automatically when you load the Dashboard
- Run manual snapshot: `POST http://localhost:3001/api/balance-history/snapshot-manual`
