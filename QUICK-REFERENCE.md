# ⚡ Quick Reference for Claude Code

## The 5 Most Important Prompts

### 1️⃣ Start Project
```bash
claude-code "Read the complete file CLAUDE-CODE-SPEC.md.

Implement a Node.js + Express booking system for parking spaces with:
- server.js (REST API)
- database.js (SQLite)
- config.js (Pricing)
- booking.html (Customer form)
- admin.html (Admin dashboard)
- package.json

Follow EXACTLY the specification in CLAUDE-CODE-SPEC.md"
```

### 2️⃣ Fix Errors
```bash
claude-code "The server won't start with Error: [ERROR HERE]

Look at server.js lines [X-Y] and fix the problem."
```

### 3️⃣ Add Feature
```bash
claude-code "Add a status filter to admin.html according to SPEC.md section 'Admin Endpoints'"
```

### 4️⃣ Optimize Code
```bash
claude-code "Check booking.html for performance and security issues. Optimize."
```

### 5️⃣ Prepare Deployment
```bash
claude-code "Create a DEPLOYMENT.md with exact commands for:
- Node.js installation
- npm install
- PM2 setup
- Nginx configuration
- SSL/HTTPS"
```

---

## Quick Setup (Copy-Paste)

```bash
# 1. Project folder
mkdir stellplatz && cd stellplatz

# 2. Start Claude Code
claude-code

# 3. Paste larger prompt (see "The 5 Most Important Prompts" → 1️⃣)

# 4. Wait until finished

# 5. Test
npm install
npm run init-db
npm start

# 6. Browser: http://localhost:3000/booking.html
```

---

## API Endpoints Quick Check

| Endpoint | Method | Description |
|----------|---------|-------------|
| `/api/locations` | GET | All locations |
| `/api/pricing/:locationId` | GET | Prices for location |
| `/api/bookings` | POST | New booking |
| `/api/contract/:bookingId` | GET | Download PDF |
| `/api/admin/dashboard` | GET | Stats (with token) |
| `/api/admin/bookings/:id/sign-owner` | POST | Sign (with token) |

---

## Database Structure Quick Look

```
locations: id, name, company, city
vehicle_types: id, max_length (5.0-8.5), label
pricing: id, location_id, vehicle_type_id, category, price_per_month
bookings: id, location_id, vehicle_type_id, category,
          first_name, last_name, address, email,
          start_date, end_date, monthly_price, caution,
          status, customer_signature_image, owner_signature_image
```

---

## Price Calculation Formula

```
Final Price = Base Price × Category Multiplier × 1.19 (VAT)

Example: Motorhome up to 5m, Outdoor (50%), with VAT
= 100 € × 0.50 × 1.19 = 59.50 € (incl. VAT)
```

---

## Status Flows

```
New → pending_customer_signature
         ↓ (Customer signs)
      pending_owner_signature
         ↓ (You sign)
      completed ✓

      (or cancelled)
```

---

## Useful Commands

```bash
# Start server
npm start

# Reset database
rm stellplatz.db && npm run init-db

# View logs (if using PM2)
pm2 logs stellplatz

# Stop server
pm2 stop stellplatz

# Change token
nano .env  # or open editor

# SQLite browser
sqlite3 stellplatz.db
> SELECT * FROM bookings;
> .quit
```

---

## Common Claude Code Errors & Fixes

| Problem | Solution |
|---------|--------|
| "Module not found" | Run `npm install` |
| "Port already in use" | `npm start -- --port 3001` or kill process |
| "ENOENT: no such file" | Check paths in imports |
| "SQLite corrupt" | `rm stellplatz.db` + restart |
| "Signature not saving" | Debug Canvas-to-Base64 conversion |

---

## File Overview

```
📦 stellplatz-booking/
├── 📄 server.js (Main file)
├── 📄 database.js (Database)
├── 📄 config.js (Prices)
├── 📄 package.json
├── 📄 .env (SECRET!)
├── 📁 public/
│   ├── booking.html (Customer)
│   └── admin.html (You)
└── 📄 stellplatz.db (Database file)
```

---

## Environment Variables

```bash
# .env file
PORT=3000
ADMIN_TOKEN=your_super_secret_token_here
NODE_ENV=production
```

---

## Test Checklist

- [ ] npm start runs
- [ ] booking.html loads on port 3000
- [ ] Form filled out → POST /api/bookings works
- [ ] admin.html loads with token
- [ ] PDF download works
- [ ] Signature canvas draws
- [ ] Signature saves

---

## Deployment Quick Checklist

```bash
# On the server:
ssh user@server.com

# In server terminal:
cd /var/www/stellplatz
npm install
npm run init-db
pm2 start server.js --name "stellplatz"
pm2 startup
pm2 save

# Check:
pm2 logs stellplatz
curl http://localhost:3000/api/locations

# Distribute client links:
https://domain.com/booking.html?location=1
https://domain.com/admin.html (enter token)
```

---

## 🔗 Location-Locked Booking Links

### Workflow: Links with preselected location

1. **In Admin Panel:**
   - Go to "Manage Locations"
   - Click "🔗 Copy Link" for desired location
   - Link is copied to clipboard

2. **Link Format:**
   ```
   https://domain.com/booking.html?location=1
   ```

3. **What happens:**
   - Customer opens link
   - Location dropdown is preselected and locked
   - Customer sees: "✓ Location has been preselected for you"
   - Customer can only enter remaining data

4. **Benefits:**
   - No risk of location confusion
   - Simplified booking process for customers
   - Track which location was booked via which link

---

## Adding Locations (after Deploy)

```bash
# SSH to server
ssh user@server.com

# Open SQLite
cd /var/www/stellplatz
sqlite3 stellplatz.db

# In SQLite prompt:
INSERT INTO locations (name, company, city) VALUES
('Potsdam', 'Company A GmbH', 'Potsdam'),
('Brandenburg', 'Company A GmbH', 'Brandenburg'),
('Frankfurt/Oder', 'Company B GmbH', 'Frankfurt/Oder');

SELECT * FROM locations;
.quit
```

---

## Support Channels

- **Claude Code Docs:** https://docs.claude.com/en/docs/claude-code
- **Express Docs:** https://expressjs.com/
- **SQLite:** https://www.sqlite.org/
- **pdfkit:** http://pdfkit.org/

---

**Pro-Tip:** Save this file as a bookmark! 🚀
