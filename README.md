# Parking Space Rental System

A fully digital and automated system for managing temporary parking space rentals (motorhomes, caravans, boats) with automatic contract generation.

## Features

✅ **Digital Booking Form** - Customers can book online with digital signature
✅ **Automatic Price Calculation** - Based on vehicle size, location, and category
✅ **Digital Signatures** - Canvas-based signature for customer and landlord
✅ **SVG Signature Support** - Scalable vector graphics for high-quality signatures
✅ **Admin Panel** - Complete management with tab navigation
✅ **HTML Contract Preview** - View contracts before PDF generation
✅ **PDF Contract Generation** - Automatic generation of professional rental contracts
✅ **SQLite Database** - Simple, reliable, no external DB required
✅ **Responsive Design** - Works on desktop, tablet, and smartphone
✅ **Company Management** - Full CRUD for company data with billing information
✅ **Location Management** - Manage multiple parking spaces with company assignment
✅ **Location-Locked Booking Links** - Send customers preselected location links
✅ **Persistent Admin Session** - Login persists via localStorage
✅ **Integrated Navigation** - Direct links between admin panel and forms

## Installation

### 1. Install Dependencies
```bash
npm install
```

### 2. Set Up Database
```bash
npm run init-db  # Creates empty database
npm run seed     # Adds sample data
```

**OR both at once:**
```bash
npm run reset-db
```

### 3. Start Server
```bash
npm start
```

The server will run on `http://localhost:3000`

## Usage

### Accessing the Application

- **Homepage:** `http://localhost:3000/`
- **Booking Form:** `http://localhost:3000/booking.html`
- **Admin Panel:** `http://localhost:3000/admin.html`

### Admin Access

**Default Admin Token:** `admin123`

To change the token, set the environment variable:
```bash
export ADMIN_TOKEN="your_secure_token"
npm start
```

### Admin Panel Features

The admin panel offers a **persistent login session** (remains even after browser restart) and has **3 main areas**:

#### 1. **Dashboard Tab**
   - Overview of all bookings with status
   - Statistics and metrics
   - Set landlord signature directly in panel
   - View HTML contract preview
   - Generate and download PDF contracts
   - Display booking details

#### 2. **Companies Tab**
   - **CRUD Operations**: Create, Edit, Delete
   - **Detailed Fields**:
     - Company name
     - Street and house number (separate)
     - Postal code and city (separate)
     - Tax number
     - VAT ID
     - Account information (IBAN, BIC)
   - **Usage**: Company data is automatically included in PDF contracts

#### 3. **Locations Tab**
   - **CRUD Operations**: Create, Edit, Delete
   - **Fields**:
     - Location name
     - Full address
     - Building/area specification
     - Company assignment (dropdown)
     - **Copy booking link** button (🔗)
   - **Usage**: Locations appear in booking form

#### Navigation
- **Green Button**: Directly to booking form (new tab)
- **Blue Button**: To homepage (new tab)
- **Red Button**: Logout (deletes session)

## Data Structure

### Companies
Company data is used as landlord information in contracts.

**Required fields:**
- `name` - Company name (must be unique)
- `street` - Street
- `house_number` - House number
- `postal_code` - Postal code
- `city` - City

**Optional:**
- `tax_number` - Tax number (e.g., "12/345/67890")
- `vat_id` - VAT ID (e.g., "DE123456789")
- `bank_account` - Account information (IBAN, BIC, multiline possible)

### Locations
Locations represent physical parking spaces and are displayed in the booking form.

**Fields:**
- `name` - Location name (e.g., "Brandenburg Parking A")
- `address` - Full address
- `building_specification` - Building/area (e.g., "Outdoor area North", "Hall 1")
- `company_id` - Associated company (Foreign Key)
- `category` - Type (indoor/outdoor/covered)

**Relation:** Each location belongs to one company (ON DELETE SET NULL)

### Vehicle Types
8 predefined size categories for vehicles:

| max_length | label        |
|-----------|--------------|
| 5.0 m     | up to 5m     |
| 6.0 m     | up to 6m     |
| 6.5 m     | up to 6.5m   |
| 7.0 m     | up to 7m     |
| 7.5 m     | up to 7.5m   |
| 8.0 m     | up to 8m     |
| 8.5 m     | up to 8.5m   |

### Pricing
Prices are automatically generated for all combinations:
- **3 Locations** × **8 Vehicle Types** × **3 Categories** = **72 Price Entries**

**Categories:**
- `outside` - Outdoor parking (50% of base price)
- `covered` - Covered parking (75% of base price)
- `indoor` - Indoor parking (100% of base price)

**Example:** Vehicle up to 7m in Brandenburg:
- Outdoor: €62.50/month
- Covered: €93.75/month
- Indoor: €125.00/month

### Bookings
Complete rental contracts with digital workflow.

**Customer Data:**
- First name, last name
- Address
- Email

**Rental Details:**
- Location (location_id)
- Vehicle type (vehicle_type_id)
- Category (outside/covered/indoor)
- Start date, end date
- Monthly price
- Deposit

**Status Workflow:**
1. `pending_customer_signature` - Customer booked, not yet signed
2. `pending_owner_signature` - Customer signed, landlord still needs to
3. `completed` - Both signatures present

**Signatures:**
- `customer_signature_image` - Base64-encoded PNG
- `customer_signature_svg` - SVG format (scalable)
- `customer_signature_date` - Timestamp
- `owner_signature_image` - Base64-encoded PNG (via admin panel)
- `owner_signature_svg` - SVG format (scalable)
- `owner_signature_date` - Timestamp

## API Endpoints

### Public APIs
- `GET /api/locations` - All locations
- `GET /api/pricing/:locationId` - Prices for location
- `POST /api/bookings` - Create new booking
- `GET /api/contract/:bookingId` - Download PDF contract
- `GET /api/contract-preview/:bookingId` - View HTML contract preview

### Admin APIs (with Bearer Token)
- `GET /api/admin/dashboard` - Dashboard data
- `GET /api/admin/bookings` - All bookings
- `POST /api/admin/bookings/:id/sign-owner` - Landlord signature

#### Companies CRUD
- `GET /api/admin/companies` - All companies
- `GET /api/admin/companies/:id` - Single company
- `POST /api/admin/companies` - New company
- `PUT /api/admin/companies/:id` - Update company
- `DELETE /api/admin/companies/:id` - Delete company

#### Locations CRUD
- `GET /api/admin/locations` - All locations
- `GET /api/admin/locations/:id` - Single location
- `POST /api/admin/locations` - New location
- `PUT /api/admin/locations/:id` - Update location
- `DELETE /api/admin/locations/:id` - Delete location

## Workflow

### Complete Booking Process

#### Phase 1: Preparation (one-time)
1. **Open admin panel** (`http://localhost:3000/admin.html`)
2. **Create companies** in "Companies" tab (with all billing details)
3. **Create locations** in "Locations" tab (with company assignment)
4. System automatically generates **72 prices** during seeding

#### Phase 2: Customer Booking
1. **Customer** finds your offer (e.g., on classifieds, eBay, etc.)
2. **You** send the customer the link:
   - Direct: `https://yourserver.com/booking.html`
   - With preselected location: `https://yourserver.com/booking.html?location=1`
   - Copy link directly from admin panel "Locations" tab (🔗 button)
3. **Customer** opens booking form and selects:
   - Location (if not preselected - will be locked if preselected)
   - Vehicle size
   - Category (outdoor/covered/indoor)
   - Rental period (start/end date)
4. System calculates **automatically**:
   - Monthly price
   - Deposit (2 months rent)
   - Total costs
5. **Customer** enters personal data
6. **Customer** signs digitally on canvas (stored as both PNG and SVG)
7. **System** saves booking with status `pending_owner_signature`

#### Phase 3: Landlord Confirmation
1. **You** open admin panel → Dashboard tab
2. New booking appears with status **"Pending Owner Signature"**
3. **You** click "View Contract" to preview in HTML
4. **You** click "Sign" to add your signature
5. **You** sign digitally in modal
6. **System** updates status to `completed`
7. **Sign button** disappears, **PDF button** becomes active

#### Phase 4: Contract Delivery
1. **You** click "Download PDF"
2. System generates **professional rental contract** with:
   - Company data (from Companies table)
   - Location data (from Locations table)
   - Customer data
   - Rental details
   - Both signatures (including timestamps)
   - SVG signatures for high quality
3. **You** send PDF via email to customer
4. **Done!** Booking is complete

### Location-Locked Booking Links

**Workflow:**
1. Admin panel → Locations tab
2. Click "🔗 Copy Link" for desired location
3. Link format: `https://domain.com/booking.html?location=1`
4. Send link to customer
5. Customer opens link with location preselected and locked

**Benefits:**
- No risk of location confusion
- Simplified booking process
- Track which location via which link

### Recurring Workflows

**Add new location:**
1. Admin panel → Locations tab → "New Location"
2. Enter data, assign company → Save
3. System automatically updates price table
4. Location appears immediately in booking form

**Edit company:**
1. Admin panel → Companies tab → Select company → "Edit"
2. Make changes → Save
3. Changes are used in future PDFs

## Configuration

### Adjust Price Structure

Edit `config.js`:

```javascript
const BASE_PRICES = {
  5.0: 100,    // Base price for up to 5m
  6.0: 115,    // Base price for up to 6m
  // ...
};

const CATEGORY_MULTIPLIERS = {
  outside: 0.50,   // 50% of base price
  covered: 0.75,   // 75% of base price
  indoor: 1.0      // 100% of base price
};
```

After changes:
```bash
npm run reset-db  # Reset database
npm start         # Restart server
```

## Deployment

### On a Server

```bash
# 1. Upload code to server
git clone <your-repo> or scp/sftp

# 2. Install dependencies
npm install

# 3. Set up database
npm run reset-db

# 4. Set environment variables (optional)
export ADMIN_TOKEN="your_secure_token"
export PORT=3000

# 5. Start with PM2 (recommended)
npm install -g pm2
pm2 start server.js --name "stellplatz"
pm2 save
pm2 startup  # Configure autostart
```

### With Nginx (Reverse Proxy)

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Troubleshooting

### Reset Database

```bash
npm run reset-db
```

**What happens:**
- Deletes `stellplatz.db` completely
- Creates new database with schema
- Adds sample data (2 companies, 3 locations, 8 vehicle types, 72 prices)
- **WARNING:** All bookings will be lost!

### Admin Login Not Working

**Symptom:** "Unauthorized" message at login

**Solutions:**
1. Use default token: `admin123`
2. Clear browser localStorage:
   ```javascript
   // In browser console (F12):
   localStorage.clear()
   ```
3. Check server-side token:
   ```bash
   # Token set?
   echo $ADMIN_TOKEN

   # If empty, default is "admin123"
   ```
4. Check browser console (F12) for errors

### Prices Not Displayed

**Symptom:** Booking form shows "No prices available"

**Diagnosis:**
```bash
sqlite3 stellplatz.db "SELECT COUNT(*) FROM pricing;"
```

**Expected value:** 72 (with 3 locations)

**If 0:**
```bash
npm run seed
```

**If error:** "UNIQUE constraint failed"
```bash
npm run reset-db
```

### Locations Not Appearing in Booking Form

**Causes:**
1. No locations created → Admin panel → Locations tab
2. No company assigned → Edit location, select company
3. No prices → `npm run seed`

**Check:**
```bash
sqlite3 stellplatz.db "SELECT * FROM locations;"
sqlite3 stellplatz.db "SELECT COUNT(*) FROM pricing WHERE location_id = 1;"
```

### PDF Generation Fails

**Symptom:** Error during PDF download

**Solutions:**
1. Create `temp/` directory:
   ```bash
   mkdir -p temp
   chmod 755 temp
   ```
2. Missing company data → Admin panel → Fill Companies tab
3. Check server logs:
   ```bash
   pm2 logs stellplatz
   # or with direct start:
   # In terminal where `npm start` runs
   ```

### Server Won't Start

**Port 3000 already in use:**
```bash
# Find process
lsof -ti:3000

# Kill process
kill $(lsof -ti:3000)

# OR use different port
PORT=3001 npm start
```

**Dependencies missing:**
```bash
rm -rf node_modules package-lock.json
npm install
```

## Development

### Start Development Server
```bash
# With auto-reload (requires nodemon)
npm run dev

# Normal execution
npm start
```

### Database Management
```bash
# Interactive SQLite shell
sqlite3 stellplatz.db

# Useful queries:
sqlite> .tables                              # Show all tables
sqlite> .schema companies                    # Show schema
sqlite> SELECT * FROM bookings;              # All bookings
sqlite> SELECT COUNT(*) FROM pricing;        # Count prices
sqlite> .mode column                         # Better output
sqlite> .headers on                          # Column headers
sqlite> .quit                                # Exit
```

### Monitor Logs
```bash
# With PM2
pm2 logs stellplatz
pm2 logs stellplatz --lines 100

# Direct
# In terminal where `npm start` runs
```

### Code Structure
```
rent-it-digital/
├── server.js                    # Express server + API endpoints
├── database.js                  # SQLite schema + initialization
├── seed.js                      # Sample data
├── config.js                    # Price configuration
├── migrate-add-svg-signatures.js # Migration script
├── package.json                 # Dependencies + scripts
├── stellplatz.db                # SQLite database (generated)
├── CONTRACT.md                  # Contract template (German)
├── public/
│   ├── index.html               # Homepage
│   ├── booking.html             # Booking form
│   └── admin.html               # Admin panel (tabs + CRUD)
└── temp/                        # PDF generation (temporary)
```

## Technology Stack

- **Backend**: Node.js + Express.js
- **Database**: SQLite3 (better-sqlite3)
- **PDF**: PDFKit
- **Frontend**: Vanilla JavaScript + HTML5 + CSS3
- **Signature**: HTML5 Canvas API (PNG + SVG export)
- **Auth**: Bearer Token (localStorage)

## Security Notes

⚠️ **For production use:**

1. **Change admin token:**
   ```bash
   export ADMIN_TOKEN="your_very_secure_random_token_here"
   ```
   Use a strong, random token (min. 32 characters)

2. **Use HTTPS:**
   - Nginx with Let's Encrypt SSL certificate
   - Never unencrypted over public internet

3. **Database backups:**
   ```bash
   # Create daily backup
   cp stellplatz.db backups/stellplatz_$(date +%Y%m%d).db
   ```

4. **Rate limiting:**
   - Express-rate-limit recommended for API endpoints
   - Protection against brute-force attacks

5. **Input validation:**
   - Already implemented for critical fields
   - XSS protection through PDFKit encoding

6. **Filesystem:**
   - Clean `temp/` directory regularly
   - Automatically delete old PDFs

## License

Proprietary - All rights reserved

## Support

For questions or problems:
- Consult troubleshooting section
- Check browser console (F12) for errors
- Review server logs

---
**Version:** 1.0.0
**Last Updated:** October 2025
**Node.js Version:** ≥ 18.x recommended
**Status:** Production Ready ✅
