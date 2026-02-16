# Quick Start Guide - Version 2.0

## 🚀 Get Started in 5 Minutes

### 1. Installation

The migration has already been completed! Your database has been upgraded with:
- ✅ 7 new tables
- ✅ 17 new columns in bookings
- ✅ 72 pricing rules migrated
- ✅ 3 sample discount codes
- ✅ 1 default contract template

### 2. Start the Server

#### Option A: Use the new v2 server (recommended)

```bash
# Start v2 server
node server-v2.js
```

Server will start on `http://localhost:3000` with:
- 🔒 JWT Authentication enabled
- 🛡️ Rate limiting active
- 📊 WAL mode database
- ✅ All new features ready

#### Option B: Test on different port first

```bash
# Start on port 3001 for testing
PORT=3001 node server-v2.js
```

### 3. Access the Application

#### New Apple-Style Booking Form
```
http://localhost:3000/booking-v2.html
```
Features:
- 4-step wizard with progress indicator
- Real-time price calculation
- Signature with undo/clear
- Contract preview
- Discount code support

#### Existing Admin Panel
```
http://localhost:3000/admin.html
```
Login: `admin123` (or your custom ADMIN_TOKEN)

### 4. Try New Features

#### A. Create a Discount Code

```bash
# Login first
curl -X POST http://localhost:3000/api/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"token":"admin123"}' \
  -c cookies.txt

# Create 20% discount
curl -X POST http://localhost:3000/api/admin/discounts \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "code": "WELCOME20",
    "discount_type": "percent",
    "value": 20,
    "usage_limit": 50
  }'
```

#### B. Create a Blackout Period

```bash
curl -X POST http://localhost:3000/api/admin/blackouts \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "location_id": 1,
    "start_date": "2025-12-24",
    "end_date": "2025-12-26",
    "reason": "Christmas closure"
  }'
```

#### C. Create an Invite Link

```bash
curl -X POST http://localhost:3000/api/admin/invite-tokens \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "location_id": 1,
    "vehicle_type_id": 3,
    "category": "indoor",
    "expires_in_hours": 72
  }'
```

Response includes the invite URL to send to customers!

#### D. Check System Health

```bash
curl http://localhost:3000/healthz
```

#### E. View Audit Log

```bash
curl -b cookies.txt http://localhost:3000/api/admin/audit-log
```

### 5. Make a Test Booking

1. Go to `http://localhost:3000/booking-v2.html`
2. **Step 1**: Select location, vehicle size, category, dates
3. **Step 2**: Enter your details
4. **Step 3**: Preview the contract
5. **Step 4**: Sign with your mouse/finger
6. Submit!

Try using discount code: `WELCOME10`, `SUMMER25`, or `EARLY50`

### 6. Manage the Booking (Admin)

1. Go to `http://localhost:3000/admin.html`
2. Login with `admin123`
3. Find your booking in the dashboard
4. Click "Sign" to add owner signature
5. Download the PDF contract

---

## 📚 What's New in v2?

### For Customers:
- 🎨 Beautiful Apple-style booking form
- 📱 Mobile-friendly responsive design
- 🖊️ Improved signature with undo/clear
- 👁️ Contract preview before signing
- 🎫 Discount codes supported
- 📧 Invite links with pre-filled forms

### For Admins:
- 💰 Flexible pricing rules and overrides
- 🚫 Blackout period management
- 🎟️ Discount code system
- 📊 CSV export for bookings
- 📝 Versioned contract templates
- 🔍 Complete audit logging
- 🔐 Secure JWT authentication

### For Developers:
- ✅ Input validation on all endpoints
- 🛡️ Rate limiting protection
- 📖 Comprehensive API documentation
- 🏗️ Clean, maintainable architecture
- 🧪 Health check endpoint
- 📈 Performance improvements (WAL mode)

---

## 🎯 Common Tasks

### View Sample Discounts

```bash
curl -b cookies.txt http://localhost:3000/api/admin/discounts | python3 -m json.tool
```

### View Pricing Rules

```bash
curl -b cookies.txt http://localhost:3000/api/admin/pricing/rules | python3 -m json.tool
```

### Export Bookings to CSV

```bash
curl -b cookies.txt http://localhost:3000/api/admin/bookings/export.csv > bookings.csv
```

### View Audit Log

```bash
curl -b cookies.txt "http://localhost:3000/api/admin/audit-log?limit=10" | python3 -m json.tool
```

---

## 🔧 Configuration

### Set Custom Admin Token

```bash
export ADMIN_TOKEN="my-super-secret-token"
node server-v2.js
```

### Set JWT Secret (Production)

```bash
export JWT_SECRET=$(openssl rand -hex 32)
node server-v2.js
```

### Production Mode

```bash
export NODE_ENV=production
export ADMIN_TOKEN="secure-token"
export JWT_SECRET="secure-jwt-secret"
export ALLOWED_ORIGINS="https://yourdomain.com"
node server-v2.js
```

---

## 📖 Documentation

- **Upgrade Guide**: `UPGRADE-TO-V2.md` - Complete migration documentation
- **Implementation Summary**: `IMPLEMENTATION-SUMMARY.md` - What was built
- **Original README**: `README.md` - Original v1 documentation
- **Briefing**: `V0.1-Briefing.md` - Original requirements

---

## 🆘 Need Help?

### Check Health

```bash
curl http://localhost:3000/healthz
```

### View Logs

Server logs appear in terminal. Look for:
- `✓` Green checkmarks = success
- `[SLOW]` = Queries taking > 1 second
- Errors logged with full stack traces

### Database Issues

```bash
# Check database is OK
sqlite3 stellplatz.db "PRAGMA integrity_check;"

# Check WAL mode
sqlite3 stellplatz.db "PRAGMA journal_mode;"
# Should return: wal
```

### Reset Everything (Careful!)

```bash
# This deletes all data!
rm -f stellplatz.db
node migrate-to-v2.js
node seed.js
```

---

## 🎉 You're All Set!

Version 2.0 is now running with all features from the briefing:

✅ JWT Authentication
✅ Flexible Pricing System
✅ Discount Codes
✅ Blackout Periods
✅ Invite Links
✅ Contract Templates
✅ Signature Improvements
✅ Audit Logging
✅ Health Checks
✅ Apple-Style UI

**Happy booking! 🚀**

---

**Questions?** Check the full documentation in:
- `UPGRADE-TO-V2.md`
- `IMPLEMENTATION-SUMMARY.md`
