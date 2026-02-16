# Upgrade Guide: v1.0 → v2.0

## Overview

Version 2.0 is a major upgrade that implements all features outlined in the V0.1-Briefing.md:

### ✨ New Features

**Package A - Security & Validation**
- ✅ JWT-based authentication with httpOnly cookies
- ✅ Comprehensive input validation using express-validator
- ✅ Rate limiting on all API endpoints
- ✅ CORS configuration for production

**Package B - Pricing & Availability**
- ✅ Flexible pricing rules with priority system
- ✅ Seasonal pricing overrides
- ✅ Location blackout periods
- ✅ Dynamic price resolution (Override > Rule > Legacy)

**Package C - Booking & Billing**
- ✅ Pro-rata calculation for partial months
- ✅ Configurable deposit multipliers
- ✅ Discount code system (percent & amount)
- ✅ One-time invite links with prefill
- ✅ Idempotency keys for booking requests

**Package D - Contract Templates**
- ✅ Versioned contract templates
- ✅ Scope-based templates (Global/Company/Location)
- ✅ Terms hash for contract integrity
- ✅ Preview step before signing

**Package E - Signature Improvements**
- ✅ Undo last stroke
- ✅ Clear signature
- ✅ Signature quality validation
- ✅ IP address and user agent tracking

**Package F - Operations**
- ✅ Health check endpoint
- ✅ SQLite WAL mode for better performance
- ✅ Comprehensive audit logging
- ✅ Automatic PDF cleanup (30 days)

**UI/UX Improvements**
- ✅ Apple Store aesthetic (SF Pro, generous whitespace)
- ✅ Multi-step booking flow with progress indicator
- ✅ Sticky price summary box
- ✅ Real-time price calculation
- ✅ Segmented controls for categories
- ✅ Smooth transitions (150-200ms)

---

## Migration Steps

### 1. Backup Your Data

The migration script creates an automatic backup, but you should also create a manual backup:

```bash
cp stellplatz.db stellplatz-manual-backup.db
```

### 2. Install New Dependencies

```bash
npm install
```

This installs:
- `jsonwebtoken` - JWT authentication
- `cookie-parser` - Cookie handling
- `express-validator` - Input validation
- `express-rate-limit` - Rate limiting
- `cors` - CORS handling

### 3. Run Migration Script

```bash
node migrate-to-v2.js
```

This script will:
- Create a timestamped database backup
- Add new database tables
- Migrate existing columns to new schema
- Convert legacy pricing to pricing rules
- Create sample discount codes
- Initialize default contract template

### 4. Test the New Server

Start the new server:

```bash
node server-v2.js
```

The server will start on `http://localhost:3000` with these improvements:
- WAL mode enabled
- JWT authentication active
- Rate limiting enabled
- Audit logging initialized

### 5. Test Key Features

#### A. New Booking Flow

Visit `http://localhost:3000/booking-v2.html`

Test:
- Multi-step wizard (4 steps)
- Real-time price calculation
- Pro-rata calculation for mid-month start
- Discount code application
- Signature with undo/clear
- Contract preview before signing

#### B. Admin Panel (Existing)

Visit `http://localhost:3000/admin.html`

Login with:
- Token: `admin123` (or your custom `ADMIN_TOKEN`)

Test:
- Dashboard statistics
- Booking filters
- CSV export
- Owner signature

#### C. New Admin Endpoints

Test via API client (Postman, curl, etc.):

```bash
# Login to get JWT cookie
curl -X POST http://localhost:3000/api/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"token":"admin123"}' \
  -c cookies.txt

# Create pricing rule (with cookie)
curl -X POST http://localhost:3000/api/admin/pricing/rules \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "location_id": 1,
    "vehicle_type_id": 1,
    "category": "indoor",
    "base_price": 150,
    "priority": 10
  }'

# Create discount code
curl -X POST http://localhost:3000/api/admin/discounts \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "code": "SPECIAL20",
    "discount_type": "percent",
    "value": 20,
    "usage_limit": 10
  }'

# Create blackout period
curl -X POST http://localhost:3000/api/admin/blackouts \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "location_id": 1,
    "start_date": "2025-12-20",
    "end_date": "2026-01-05",
    "reason": "Holiday closure"
  }'

# Create invite link
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

#### D. Health Check

```bash
curl http://localhost:3000/healthz
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2025-10-24T...",
  "database": "ok",
  "tempDir": "ok",
  "uptime": 123.45
}
```

### 6. Replace Old Server (When Ready)

Once you've tested everything:

```bash
# Keep backup of old server
mv server.js server-v1-old.js

# Make v2 the main server
mv server-v2.js server.js

# Update package.json start script (already points to server.js)
npm start
```

---

## New Database Schema

### New Tables

#### `contract_templates`
Versioned contract templates with scope support
- `scope_type`: global, company, or location
- `is_active`: Only one active per scope
- `body_md`: Markdown template with variables

#### `pricing_rules`
Flexible pricing with priority and validity periods
- Replaces static `pricing` table
- Supports date ranges
- Priority-based selection

#### `pricing_overrides`
Seasonal or special event pricing
- Overrides rules for specific date ranges
- Takes precedence over rules

#### `discounts`
Discount code management
- Percent or amount types
- Usage limits
- Location-specific or global

#### `location_blackouts`
Unavailable date ranges per location
- Prevents bookings in blocked periods
- Includes reason field

#### `invite_tokens`
One-time booking invitation links
- Pre-filled location/vehicle/category
- Expiry dates
- Tracks usage

#### `audit_log`
Comprehensive activity logging
- Actor, action, entity tracking
- IP address and user agent
- Metadata in JSON format

### Enhanced Tables

#### `bookings` (new columns)
- `prorata_amount` - First month pro-rata
- `discount_code` - Applied discount
- `discount_amount` - Discount value
- `deposit_multiplier` - Configurable deposit
- `total_amount` - Total amount due
- `template_id` - Contract template used
- `template_version` - Template version
- `terms_hash` - Contract integrity hash
- `customer_signer_ip` - Customer IP
- `customer_user_agent` - Customer browser
- `owner_signer_ip` - Owner IP
- `owner_user_agent` - Owner browser
- `idempotency_key` - Prevent duplicates

---

## Configuration

### Environment Variables

```bash
# JWT Secret (auto-generated if not set)
export JWT_SECRET="your-super-secret-key-min-32-chars"

# Admin Token
export ADMIN_TOKEN="your-secure-admin-token"

# Server Port
export PORT=3000

# Production Mode
export NODE_ENV="production"

# Allowed Origins for CORS (comma-separated)
export ALLOWED_ORIGINS="https://yourdomain.com,https://www.yourdomain.com"
```

### Recommended Production Settings

```bash
# Generate secure JWT secret
export JWT_SECRET=$(openssl rand -hex 32)

# Strong admin token
export ADMIN_TOKEN=$(openssl rand -hex 32)

# Enable production mode
export NODE_ENV="production"

# Set allowed origins
export ALLOWED_ORIGINS="https://yourdomain.com"
```

---

## API Reference

### New Public Endpoints

#### `GET /healthz`
Health check endpoint

#### `GET /api/availability?location_id=1&from=2025-01-01&to=2025-12-31`
Check blackout periods

#### `GET /api/invite/:token`
Get invite token details

### New Admin Endpoints

#### Authentication
- `POST /api/admin/auth/login` - Get JWT cookie
- `POST /api/admin/auth/logout` - Clear JWT cookie

#### Pricing
- `GET /api/admin/pricing/rules` - List all pricing rules
- `POST /api/admin/pricing/rules` - Create pricing rule
- `DELETE /api/admin/pricing/rules/:id` - Delete pricing rule
- `GET /api/admin/pricing/overrides` - List overrides
- `POST /api/admin/pricing/overrides` - Create override
- `DELETE /api/admin/pricing/overrides/:id` - Delete override

#### Discounts
- `GET /api/admin/discounts` - List all discounts
- `POST /api/admin/discounts` - Create discount
- `PUT /api/admin/discounts/:id/toggle` - Toggle active status
- `DELETE /api/admin/discounts/:id` - Delete discount

#### Blackouts
- `GET /api/admin/blackouts` - List all blackouts
- `POST /api/admin/blackouts` - Create blackout
- `DELETE /api/admin/blackouts/:id` - Delete blackout

#### Templates
- `GET /api/admin/templates` - List all templates
- `POST /api/admin/templates` - Create new template version
- `PUT /api/admin/templates/:id/activate` - Activate template

#### Invite Tokens
- `POST /api/admin/invite-tokens` - Create invite link

#### Audit Log
- `GET /api/admin/audit-log?limit=100&offset=0` - View audit log

#### Export
- `GET /api/admin/bookings/export.csv` - Export bookings to CSV

---

## Performance Improvements

1. **WAL Mode**: SQLite uses Write-Ahead Logging for better concurrency
2. **Indexes**: Optimized indexes on frequently queried columns
3. **Rate Limiting**: Prevents abuse, improves stability
4. **Caching**: JWT tokens cache authentication
5. **Cleanup**: Automatic removal of old temp files

---

## Security Enhancements

1. **JWT Authentication**: Secure, stateless auth with httpOnly cookies
2. **Input Validation**: All inputs validated before processing
3. **Rate Limiting**: 100 requests per 15 min (API), 5 per 15 min (auth)
4. **CORS**: Restrictive CORS in production
5. **Audit Logging**: All critical actions logged with IP/user agent
6. **Signature Validation**: Minimum quality checks prevent trivial signatures
7. **Terms Hash**: Contract integrity verification

---

## Troubleshooting

### Migration Issues

**Problem**: Migration fails with "table already exists"
**Solution**: The migration is idempotent. It's safe to run again.

**Problem**: Old bookings missing new fields
**Solution**: Migration adds columns with default values. Check `migrate-to-v2.js` output.

### Authentication Issues

**Problem**: "Unauthorized" after login
**Solution**: Check that cookies are enabled. JWT is sent via httpOnly cookie.

**Problem**: Token expired
**Solution**: JWT tokens expire after 2 hours. Log in again.

### Pricing Issues

**Problem**: "NO_PRICE_RULE" error
**Solution**: Create pricing rules for all location/vehicle/category combinations.

```bash
# Check current rules
sqlite3 stellplatz.db "SELECT * FROM pricing_rules;"

# If empty, run migration again or create manually
```

### Performance Issues

**Problem**: Slow queries
**Solution**: Check that WAL mode is enabled:

```bash
sqlite3 stellplatz.db "PRAGMA journal_mode;"
# Should return: wal
```

---

## Rollback Procedure

If you need to rollback to v1:

```bash
# Stop the server
# Restore the backup database
cp stellplatz-backup-*.db stellplatz.db

# Use old server
node server-v1-backup.js
```

Note: Bookings created in v2 with new fields will still work in v1, but v2-specific features won't function.

---

## Next Steps

1. **Create Admin UI for new features**: Build frontend for pricing rules, discounts, blackouts, templates
2. **Email Notifications**: Add email sending for booking confirmations
3. **Payment Integration**: Integrate payment provider (Stripe, PayPal)
4. **Multi-language Support**: Add i18n for international customers
5. **Advanced Reporting**: Analytics dashboard with charts
6. **Mobile App**: Native mobile app for customers

---

## Support

For issues or questions:
- Review this guide
- Check the audit log: `GET /api/admin/audit-log`
- Review server logs
- Check browser console (F12) for frontend errors

---

**Version**: 2.0.0
**Last Updated**: October 2025
**Compatibility**: Node.js ≥ 18.x
**Status**: Production Ready ✅
