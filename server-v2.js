require('dotenv').config();
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const crypto = require('crypto');

// Import custom modules
const db = require('./database-v2');
const auth = require('./auth');
const validators = require('./validation');
const pricing = require('./pricing');
const mailer = require('./email');

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== MIDDLEWARE ====================

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // Limit login attempts
  message: 'Too many login attempts, please try again later.'
});

// CORS configuration
const corsOptions = {
  origin: process.env.NODE_ENV === 'production'
    ? process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000']
    : true,
  credentials: true
};

app.use(cors(corsOptions));
app.use(cookieParser());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static('public'));

// Apply rate limiting to API routes
app.use('/api/', apiLimiter);

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (duration > 1000) {
      console.log(`[SLOW] ${req.method} ${req.path} - ${duration}ms`);
    }
  });
  next();
});

// ==================== ROUTES ====================

// ==================== CLEAN URL ROUTING ====================

// Root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Clean URL routes (without .html extension)
app.get('/booking', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'booking-v2.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Backward compatibility - redirect old .html URLs to clean URLs
app.get('/booking.html', (req, res) => {
  res.redirect(301, '/booking' + (req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : ''));
});

app.get('/booking-v2.html', (req, res) => {
  res.redirect(301, '/booking' + (req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : ''));
});

app.get('/admin.html', (req, res) => {
  res.redirect(301, '/admin');
});

// ==================== HEALTH CHECK ====================

app.get('/healthz', (req, res) => {
  try {
    // Check database connectivity
    const result = db.prepare('SELECT 1 as health').get();

    // Check temp directory
    const tempExists = fs.existsSync('./temp');

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: result.health === 1 ? 'ok' : 'error',
      tempDir: tempExists ? 'ok' : 'missing',
      uptime: process.uptime()
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

// ==================== AUTH ROUTES ====================

app.post('/api/admin/auth/login', authLimiter, (req, res) => {
  auth.loginHandler(req, res, db);
});

app.post('/api/admin/auth/logout', auth.requireAuth, (req, res) => {
  auth.logoutHandler(req, res, db);
});

// ==================== PUBLIC API ====================

// GET all Locations
app.get('/api/locations', (req, res) => {
  try {
    const locations = db.prepare(`
      SELECT l.*, c.name as company_name
      FROM locations l
      LEFT JOIN companies c ON l.company_id = c.id
      ORDER BY l.name
    `).all();
    res.json(locations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET Pricing for a location
app.get('/api/pricing/:locationId', validators.locationIdParam, (req, res) => {
  try {
    const { locationId } = req.params;
    const { date } = req.query;

    const vehicleTypes = db.prepare('SELECT * FROM vehicle_types ORDER BY max_length').all();
    const categories = ['outside', 'covered', 'indoor'];

    const pricingData = [];

    vehicleTypes.forEach(vt => {
      categories.forEach(category => {
        try {
          const priceInfo = pricing.resolvePrice(db, locationId, vt.id, category, date);
          pricingData.push({
            vehicle_type_id: vt.id,
            vehicle_label: vt.label,
            max_length: vt.max_length,
            category,
            price: priceInfo.price,
            source: priceInfo.source
          });
        } catch (e) {
          // Price not available for this combination
        }
      });
    });

    res.json(pricingData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET Availability (blackouts)
app.get('/api/availability', (req, res) => {
  try {
    const { location_id, from, to } = req.query;

    if (!location_id || !from || !to) {
      return res.status(400).json({ error: 'location_id, from, and to parameters required' });
    }

    const blackouts = pricing.checkBlackouts(db, location_id, from, to);

    res.json({
      available: blackouts.length === 0,
      blackouts: blackouts.map(b => ({
        start_date: b.start_date,
        end_date: b.end_date
        // Don't expose reason to public
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== SHARED PDF GENERATION ====================

const renderSVGSignature = (doc, svgString, x, y, scale = 0.25) => {
  if (!svgString) return;
  try {
    const pathMatches = svgString.matchAll(/<path d="([^"]+)"/g);
    for (const match of pathMatches) {
      const pathData = match[1];
      const commands = pathData.split(/(?=[ML])/);
      let firstPoint = true;
      for (const cmd of commands) {
        const type = cmd[0];
        const coords = cmd.slice(1).trim().split(/\s+/).map(c => parseFloat(c));
        if (type === 'M' && coords.length >= 2) {
          doc.moveTo(x + coords[0] * scale, y + coords[1] * scale);
          firstPoint = false;
        } else if (type === 'L' && coords.length >= 2) {
          doc.lineTo(x + coords[0] * scale, y + coords[1] * scale);
        }
      }
      if (!firstPoint) {
        doc.stroke();
      }
    }
  } catch (error) {
    console.error('Error rendering SVG signature:', error);
  }
};

const renderMarkdownToPDF = (doc, renderedBody) => {
  const lines = renderedBody.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (!line) {
      // Empty line = paragraph break
      doc.moveDown(0.7);
      continue;
    }

    if (line.startsWith('# ')) {
      doc.fontSize(22).font('Helvetica-Bold').text(line.substring(2), { align: 'center', lineGap: 6 });
      doc.moveDown(1.2);
    } else if (line.startsWith('### ')) {
      doc.fontSize(13).font('Helvetica-Bold').text(line.substring(4), { lineGap: 5 });
      doc.moveDown(0.5);
    } else if (line.startsWith('## ')) {
      doc.moveDown(0.8);
      doc.fontSize(16).font('Helvetica-Bold').text(line.substring(3), { align: 'center', lineGap: 5 });
      doc.moveDown(0.3);
    } else {
      // Handle bold markers: render **text** in bold
      const cleanLine = line.replace(/\*\*/g, '');
      const isBold = line.startsWith('**') && line.endsWith('**');
      doc.fontSize(12).font(isBold ? 'Helvetica-Bold' : 'Helvetica').text(cleanLine, { lineGap: 3 });
    }
  }
};

const renderSignatures = (doc, booking) => {
  doc.moveDown(2);
  doc.fontSize(13).font('Helvetica-Bold').text('Unterschriften');
  doc.moveDown(0.5);

  doc.fontSize(11).font('Helvetica').text('Mieter:');
  const mieterSignY = doc.y;
  if (booking.customer_signature_svg) {
    renderSVGSignature(doc, booking.customer_signature_svg, 70, mieterSignY);
  }
  doc.y = mieterSignY + 40;
  doc.moveTo(70, doc.y).lineTo(270, doc.y).stroke();
  if (booking.customer_signature_date) {
    const sigDate = new Date(booking.customer_signature_date).toLocaleDateString('de-DE');
    doc.text(`(${booking.first_name} ${booking.last_name}, ${sigDate})`, 70, doc.y + 3);
  }
  doc.moveDown(2);

  doc.fontSize(11).font('Helvetica').text('Vermieter:');
  const vermieterSignY = doc.y;
  if (booking.owner_signature_svg) {
    renderSVGSignature(doc, booking.owner_signature_svg, 70, vermieterSignY);
  }
  doc.y = vermieterSignY + 40;
  doc.moveTo(70, doc.y).lineTo(270, doc.y).stroke();
  if (booking.owner_signature_date) {
    const ownerSigDate = new Date(booking.owner_signature_date).toLocaleDateString('de-DE');
    doc.text(`(${booking.company_name}, ${ownerSigDate})`, 70, doc.y + 3);
  }

  doc.moveDown(2);
  doc.fontSize(8).fillColor('#666');
  doc.text(`Contract ID: ${booking.id} | Template v${booking.template_version} | Terms: ${booking.terms_hash?.substring(0, 16)}... | Generated: ${new Date().toISOString()}`, { align: 'center' });
};

const getBookingForContract = (bookingId) => {
  return db.prepare(`
    SELECT
      b.*,
      l.name as location_name,
      l.address as location_address,
      l.building_specification,
      l.category,
      l.access_code,
      c.name as company_name,
      c.street as company_street,
      c.house_number as company_house_number,
      c.postal_code as company_postal_code,
      c.city as company_city,
      c.email as company_email,
      vt.label as vehicle_label,
      vt.max_length as vehicle_length,
      ct.body_md as template_body
    FROM bookings b
    JOIN locations l ON b.location_id = l.id
    LEFT JOIN companies c ON l.company_id = c.id
    JOIN vehicle_types vt ON b.vehicle_type_id = vt.id
    LEFT JOIN contract_templates ct ON b.template_id = ct.id
    WHERE b.id = ?
  `).get(bookingId);
};

const buildTemplateData = (booking) => {
  const netPrice = booking.monthly_price;
  const vatAmount = pricing.calculateVAT(netPrice);
  const grossPrice = netPrice + vatAmount;
  const categoryLabels = { outside: 'Außenstellplatz', covered: 'Überdacht', indoor: 'Halle' };

  return {
    company_name: booking.company_name,
    company_street: booking.company_street,
    company_house_number: booking.company_house_number,
    company_postal_code: booking.company_postal_code,
    company_city: booking.company_city,
    company_email: booking.company_email || booking.company_name?.toLowerCase().replace(/\s+/g, '-'),
    customer_first_name: booking.first_name,
    customer_last_name: booking.last_name,
    customer_address: booking.address,
    customer_email: booking.email,
    location_address: booking.location_address,
    category_label: categoryLabels[booking.category],
    vehicle_label: booking.vehicle_label,
    vehicle_length: booking.vehicle_length,
    access_code: booking.access_code || null,
    start_date: new Date(booking.start_date).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' }),
    end_date: new Date(booking.end_date).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' }),
    net_price: netPrice.toFixed(2),
    vat_amount: vatAmount.toFixed(2),
    gross_price: grossPrice.toFixed(2),
    prorata_amount: booking.prorata_amount ? (booking.prorata_amount + pricing.calculateVAT(booking.prorata_amount)).toFixed(2) : null,
    discount_code: booking.discount_amount > 0 ? booking.discount_code : null,
    discount_amount: booking.discount_amount > 0 ? booking.discount_amount.toFixed(2) : null,
    caution: booking.caution.toFixed(2),
    contract_date: new Date().toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })
  };
};

const generateContractPDFBuffer = (bookingId) => {
  return new Promise((resolve, reject) => {
    const booking = getBookingForContract(bookingId);
    if (!booking) return reject(new Error('Booking not found'));

    const templateData = buildTemplateData(booking);
    const renderedBody = pricing.renderTemplate(booking.template_body || '', templateData);

    const doc = new PDFDocument({ bufferPages: true, margin: 50, size: 'A4' });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve({ pdfBuffer: Buffer.concat(chunks), booking }));
    doc.on('error', reject);

    renderMarkdownToPDF(doc, renderedBody);
    renderSignatures(doc, booking);
    doc.end();
  });
};

// ==================== PUBLIC API ====================

// POST Create Booking
app.post('/api/bookings', validators.createBooking, (req, res) => {
  try {
    const {
      locationId,
      vehicleTypeId,
      firstName,
      lastName,
      address,
      email,
      startDate,
      endDate,
      category,
      customerSignatureImage,
      customerSignatureSVG,
      discountCode,
      depositMultiplier,
      billingCycle,
      noticePeriodDays,
      idempotencyKey
    } = req.body;

    // Idempotency check
    if (idempotencyKey) {
      const existing = db.prepare('SELECT id FROM bookings WHERE idempotency_key = ?').get(idempotencyKey);
      if (existing) {
        return res.json({ success: true, bookingId: existing.id, idempotent: true });
      }
    }

    // Validate signature quality
    const sigValidation = pricing.validateSignature(customerSignatureSVG);
    if (!sigValidation.valid) {
      return res.status(400).json({ success: false, error: sigValidation.error });
    }

    // Check blackouts
    const blackouts = pricing.checkBlackouts(db, locationId, startDate, endDate);
    if (blackouts.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Selected dates conflict with blocked periods',
        blackouts
      });
    }

    // Get location and company info
    const location = db.prepare(`
      SELECT l.*, c.id as company_id, c.name as company_name
      FROM locations l
      LEFT JOIN companies c ON l.company_id = c.id
      WHERE l.id = ?
    `).get(locationId);

    if (!location) {
      return res.status(400).json({ success: false, error: 'Invalid location' });
    }

    // Resolve price
    const priceInfo = pricing.resolvePrice(db, locationId, vehicleTypeId, category, startDate);
    const monthlyPrice = priceInfo.price;

    // Calculate pro-rata
    const proRataAmount = pricing.calculateProRata(monthlyPrice, startDate);

    // Apply discount
    const discountResult = pricing.applyDiscount(db, discountCode, monthlyPrice, locationId, startDate);
    const discountAmount = discountResult.discountAmount;

    // Calculate deposit
    const deposit = pricing.calculateDeposit(monthlyPrice, depositMultiplier || 1);

    // Calculate total
    const totalAmount = pricing.calculateTotalBilling(
      monthlyPrice,
      proRataAmount,
      discountAmount,
      deposit
    );

    // Get active template
    const template = pricing.getActiveTemplate(db, locationId, location.company_id);
    if (!template) {
      return res.status(500).json({ success: false, error: 'No active contract template found' });
    }

    // Generate terms hash
    const termsHash = pricing.generateTermsHash(
      template.body_md,
      template.version,
      location.company_id,
      locationId
    );

    // Get client IP and user agent (ensure strings)
    const clientIp = String(req.ip || req.connection?.remoteAddress || 'unknown');
    const userAgent = String(req.get('user-agent') || 'unknown');

    // Insert booking
    const stmt = db.prepare(`
      INSERT INTO bookings (
        location_id, vehicle_type_id, category,
        first_name, last_name, address, email,
        start_date, end_date,
        monthly_price, prorata_amount, discount_code, discount_amount,
        deposit_multiplier, caution, total_amount,
        billing_cycle, notice_period_days,
        template_id, template_version, terms_hash,
        customer_signature_image, customer_signature_svg,
        customer_signature_date, customer_signer_ip, customer_user_agent,
        status, idempotency_key
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, 'pending_owner_signature', ?)
    `);

    const result = stmt.run(
      parseInt(locationId),
      parseInt(vehicleTypeId),
      String(category),
      String(firstName),
      String(lastName),
      String(address),
      String(email),
      String(startDate),
      String(endDate),
      parseFloat(monthlyPrice),
      proRataAmount ? parseFloat(proRataAmount) : null,
      discountCode ? String(discountCode).toUpperCase() : null,
      parseFloat(discountAmount),
      parseInt(depositMultiplier) || 2,
      parseFloat(deposit),
      parseFloat(totalAmount),
      String(billingCycle) || 'monthly',
      parseInt(noticePeriodDays) || 30,
      parseInt(template.id),
      parseInt(template.version),
      String(termsHash),
      String(customerSignatureImage),
      String(customerSignatureSVG),
      clientIp,
      userAgent,
      idempotencyKey ? String(idempotencyKey) : null
    );

    // Increment discount usage if applicable
    if (discountResult.isValid && discountResult.discountId) {
      pricing.incrementDiscountUsage(db, discountResult.discountId);
    }

    // Log audit
    auth.logAudit(db, 'customer', 'booking_created', 'booking', result.lastInsertRowid, {
      location_id: locationId,
      total_amount: totalAmount
    }, clientIp, userAgent);

    res.json({ success: true, bookingId: result.lastInsertRowid });

    // Send emails (async, non-blocking)
    const vehicleType = db.prepare('SELECT label FROM vehicle_types WHERE id = ?').get(vehicleTypeId);
    const bookingData = {
      id: result.lastInsertRowid,
      first_name: firstName,
      last_name: lastName,
      email: email,
      location_name: location.company_name ? `${location.name}` : location.name,
      category: category,
      vehicle_label: vehicleType?.label || '',
      start_date: startDate,
      end_date: endDate,
      monthly_price: monthlyPrice,
      caution: deposit
    };

    mailer.sendBookingConfirmation(bookingData);

    // Get company email for admin notification
    const company = location.company_id
      ? db.prepare('SELECT email FROM companies WHERE id = ?').get(location.company_id)
      : null;
    if (company?.email) {
      mailer.sendAdminNotification(bookingData, company.email);
    }
  } catch (error) {
    console.error('Booking error:', error);
    if (error.message === 'NO_PRICE_RULE') {
      res.status(400).json({ success: false, error: 'No pricing available for selected options' });
    } else {
      res.status(500).json({ success: false, error: error.message });
    }
  }
});

// GET Contract Preview (HTML)
app.get('/api/contract-preview/:bookingId', validators.bookingIdParam, (req, res) => {
  try {
    const booking = db.prepare(`
      SELECT
        b.*,
        l.name as location_name,
        l.address as location_address,
        l.building_specification,
        l.category as location_category,
        l.access_code,
        c.name as company_name,
        c.street as company_street,
        c.house_number as company_house_number,
        c.postal_code as company_postal_code,
        c.city as company_city,
        c.tax_number as company_tax_number,
        c.vat_id as company_vat_id,
        c.bank_account as company_bank_account,
        c.email as company_email_address,
        vt.label as vehicle_label,
        vt.max_length as vehicle_length,
        ct.name as template_name,
        ct.body_md as template_body
      FROM bookings b
      JOIN locations l ON b.location_id = l.id
      LEFT JOIN companies c ON l.company_id = c.id
      JOIN vehicle_types vt ON b.vehicle_type_id = vt.id
      LEFT JOIN contract_templates ct ON b.template_id = ct.id
      WHERE b.id = ?
    `).get(req.params.bookingId);

    if (!booking) {
      return res.status(404).send('<h1>Booking not found</h1>');
    }

    // Prepare template data
    const categoryLabels = {
      'outside': 'Außenstellplatz',
      'covered': 'Überdacht',
      'indoor': 'Halle'
    };

    const netPrice = booking.monthly_price;
    const vatAmount = pricing.calculateVAT(netPrice);
    const grossPrice = netPrice + vatAmount;

    const templateData = {
      company_name: booking.company_name,
      company_street: booking.company_street,
      company_house_number: booking.company_house_number,
      company_postal_code: booking.company_postal_code,
      company_city: booking.company_city,
      company_email: booking.company_email_address || booking.company_name?.toLowerCase().replace(/\s+/g, '-'),
      customer_first_name: booking.first_name,
      customer_last_name: booking.last_name,
      customer_address: booking.address,
      customer_email: booking.email,
      location_address: booking.location_address,
      category_label: categoryLabels[booking.category],
      vehicle_label: booking.vehicle_label,
      vehicle_length: booking.vehicle_length,
      access_code: booking.access_code || null,
      start_date: new Date(booking.start_date).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' }),
      end_date: new Date(booking.end_date).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' }),
      net_price: netPrice.toFixed(2),
      vat_amount: vatAmount.toFixed(2),
      gross_price: grossPrice.toFixed(2),
      prorata_amount: booking.prorata_amount ? (booking.prorata_amount + pricing.calculateVAT(booking.prorata_amount)).toFixed(2) : null,
      discount_code: booking.discount_amount > 0 ? booking.discount_code : null,
      discount_amount: booking.discount_amount > 0 ? booking.discount_amount.toFixed(2) : null,
      caution: booking.caution.toFixed(2),
      contract_date: new Date().toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' }),
      customer_signature: booking.customer_signature_svg || '(Nicht unterschrieben)',
      owner_signature: booking.owner_signature_svg || '(Nicht unterschrieben)'
    };

    // Render template
    const renderedBody = pricing.renderTemplate(booking.template_body, templateData);

    // Convert markdown to HTML (simple conversion)
    let html = renderedBody
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>');

    html = `<p>${html}</p>`;

    const fullHtml = `
<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Vertrag - Vorschau</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif;
            max-width: 800px;
            margin: 20px auto;
            padding: 40px;
            background: #f5f5f7;
            line-height: 1.6;
        }
        .contract {
            background: white;
            padding: 60px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            border-radius: 12px;
        }
        h1 {
            text-align: center;
            color: #1d1d1f;
            margin-bottom: 30px;
            font-size: 34px;
            font-weight: 600;
        }
        h2 {
            color: #1d1d1f;
            text-align: center;
            margin-top: 35px;
            margin-bottom: 12px;
            font-size: 19px;
            font-weight: 600;
        }
        h3 {
            color: #1d1d1f;
            font-size: 17px;
            font-weight: 600;
        }
        p {
            margin: 10px 0;
            font-size: 16px;
            color: #1d1d1f;
            text-align: justify;
        }
        .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #d2d2d7;
            font-size: 11px;
            color: #86868b;
            text-align: center;
        }
        .signature-box {
            margin: 20px 0;
            padding: 15px;
            background: #f5f5f7;
            border-radius: 8px;
        }
        .signature-image {
            margin: 10px 0;
            min-height: 60px;
        }
        .status-badge {
            display: inline-block;
            padding: 6px 12px;
            border-radius: 16px;
            font-size: 12px;
            font-weight: 500;
            margin: 10px 0;
        }
        .status-pending {
            background: #fef3cd;
            color: #664d03;
        }
        .status-completed {
            background: #d1e7dd;
            color: #0f5132;
        }
    </style>
</head>
<body>
    <div class="contract">
        ${html}

        <div class="signature-box">
            <h3>Kundenunterschrift:</h3>
            <div class="signature-image">${booking.customer_signature_svg || '<p>(Ausstehend)</p>'}</div>
            <small>${booking.customer_signature_date ? new Date(booking.customer_signature_date).toLocaleDateString('de-DE') : ''}</small>
        </div>

        <div class="signature-box">
            <h3>Vermieterunterschrift:</h3>
            <div class="signature-image">${booking.owner_signature_svg || '<p>(Ausstehend)</p>'}</div>
            <small>${booking.owner_signature_date ? new Date(booking.owner_signature_date).toLocaleDateString('de-DE') : ''}</small>
        </div>

        ${booking.status === 'pending_owner_signature' ? '<div class="status-badge status-pending">⏳ Warten auf Vermieterunterschrift</div>' : ''}
        ${booking.status === 'completed' ? '<div class="status-badge status-completed">✓ Vollständig unterzeichnet</div>' : ''}

        <div class="footer">
            Contract ID: ${booking.id} | Template: ${booking.template_name} v${booking.template_version} | Terms Hash: ${booking.terms_hash?.substring(0, 16)}...
        </div>
    </div>
</body>
</html>
    `;

    res.send(fullHtml);
  } catch (error) {
    console.error('Contract preview error:', error);
    res.status(500).send(`<h1>Error</h1><p>${error.message}</p>`);
  }
});

// Download PDF Contract (same as before but with enhanced data)
app.get('/api/contract/:bookingId', validators.bookingIdParam, async (req, res) => {
  try {
    const { pdfBuffer, booking } = await generateContractPDFBuffer(req.params.bookingId);

    auth.logAudit(db, 'system', 'pdf_generated', 'booking', booking.id, null, req.ip, req.get('user-agent'));

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="vertrag_${booking.id}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('PDF Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== ADMIN API ====================

// Dashboard
app.get('/api/admin/dashboard', auth.requireAuth, (req, res) => {
  try {
    const stats = {
      totalBookings: db.prepare('SELECT COUNT(*) as count FROM bookings').get().count,
      pendingCustomerSignature: db.prepare("SELECT COUNT(*) as count FROM bookings WHERE status = 'pending_customer_signature'").get().count,
      pendingOwnerSignature: db.prepare("SELECT COUNT(*) as count FROM bookings WHERE status = 'pending_owner_signature'").get().count,
      completed: db.prepare("SELECT COUNT(*) as count FROM bookings WHERE status = 'completed'").get().count,
      last30Days: db.prepare("SELECT COUNT(*) as count FROM bookings WHERE created_at >= date('now', '-30 days')").get().count
    };

    const recentBookings = db.prepare(`
      SELECT b.*, l.name as location_name, COALESCE(vt.label, 'Unbekannt') as vehicle_label
      FROM bookings b
      LEFT JOIN locations l ON b.location_id = l.id
      LEFT JOIN vehicle_types vt ON b.vehicle_type_id = vt.id
      ORDER BY b.created_at DESC
      LIMIT 10
    `).all();

    res.json({ stats, recentBookings });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET all Bookings with filters
app.get('/api/admin/bookings', auth.requireAuth, validators.bookingFilters, (req, res) => {
  try {
    const { status, location_id, from, to } = req.query;

    let query = `
      SELECT b.*, l.name as location_name, vt.label as vehicle_label
      FROM bookings b
      JOIN locations l ON b.location_id = l.id
      JOIN vehicle_types vt ON b.vehicle_type_id = vt.id
      WHERE 1=1
    `;

    const params = [];

    if (status) {
      query += ' AND b.status = ?';
      params.push(status);
    }

    if (location_id) {
      query += ' AND b.location_id = ?';
      params.push(location_id);
    }

    if (from) {
      query += ' AND b.start_date >= ?';
      params.push(from);
    }

    if (to) {
      query += ' AND b.end_date <= ?';
      params.push(to);
    }

    query += ' ORDER BY b.created_at DESC';

    const bookings = db.prepare(query).all(...params);
    res.json(bookings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Export Bookings to CSV
app.get('/api/admin/bookings/export.csv', auth.requireAuth, (req, res) => {
  try {
    const bookings = db.prepare(`
      SELECT
        b.id,
        b.first_name,
        b.last_name,
        b.email,
        b.address,
        l.name as location,
        vt.label as vehicle,
        b.category,
        b.start_date,
        b.end_date,
        b.monthly_price,
        b.caution,
        b.total_amount,
        b.status,
        b.created_at
      FROM bookings b
      JOIN locations l ON b.location_id = l.id
      JOIN vehicle_types vt ON b.vehicle_type_id = vt.id
      ORDER BY b.created_at DESC
    `).all();

    // CSV headers
    const headers = ['ID', 'Vorname', 'Nachname', 'Email', 'Adresse', 'Standort', 'Fahrzeug', 'Kategorie', 'Von', 'Bis', 'Monatsmiete', 'Kaution', 'Gesamt', 'Status', 'Erstellt'];

    // CSV rows
    const rows = bookings.map(b => [
      b.id,
      b.first_name,
      b.last_name,
      b.email,
      b.address,
      b.location,
      b.vehicle,
      b.category,
      b.start_date,
      b.end_date,
      b.monthly_price,
      b.caution,
      b.total_amount,
      b.status,
      b.created_at
    ]);

    // Generate CSV
    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=bookings.csv');
    res.send(csv);

    // Log audit
    auth.logAudit(db, req.user.role, 'bookings_exported', 'booking', null, null, req.ip, req.get('user-agent'));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST Owner Signature
app.post('/api/admin/bookings/:bookingId/sign-owner', auth.requireAuth, validators.bookingIdParam, validators.signOwner, (req, res) => {
  try {
    const { bookingId } = req.params;
    const { signatureImage, signatureSVG } = req.body;

    // Validate signature quality
    const sigValidation = pricing.validateSignature(signatureSVG);
    if (!sigValidation.valid) {
      return res.status(400).json({ success: false, error: sigValidation.error });
    }

    const clientIp = String(req.ip || req.connection?.remoteAddress || 'unknown');
    const userAgent = String(req.get('user-agent') || 'unknown');

    const stmt = db.prepare(`
      UPDATE bookings
      SET owner_signature_image = ?,
          owner_signature_svg = ?,
          owner_signature_date = datetime('now'),
          owner_signer_ip = ?,
          owner_user_agent = ?,
          status = 'completed'
      WHERE id = ?
    `).run(
      String(signatureImage),
      String(signatureSVG),
      clientIp,
      userAgent,
      parseInt(bookingId)
    );

    if (stmt.changes === 0) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }

    // Log audit
    auth.logAudit(db, req.user.role, 'owner_signed', 'booking', bookingId, null, clientIp, userAgent);

    res.json({ success: true });

    // Send contract completion email with PDF (async, non-blocking)
    try {
      generateContractPDFBuffer(bookingId).then(({ pdfBuffer, booking: completedBooking }) => {
        mailer.sendContractCompleted(completedBooking, pdfBuffer, completedBooking.company_email);
      }).catch(err => console.error('Error generating email PDF:', err));
    } catch (emailError) {
      console.error('Error sending contract email:', emailError);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE Booking
app.delete('/api/admin/bookings/:bookingId', auth.requireAuth, validators.bookingIdParam, (req, res) => {
  try {
    const { bookingId } = req.params;
    const booking = db.prepare('SELECT id, first_name, last_name FROM bookings WHERE id = ?').get(bookingId);
    if (!booking) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }

    db.prepare('DELETE FROM bookings WHERE id = ?').run(bookingId);

    auth.logAudit(db, req.user.role, 'booking_deleted', 'booking', bookingId, {
      customer: `${booking.first_name} ${booking.last_name}`
    }, req.ip, req.get('user-agent'));

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== COMPANIES CRUD ====================

app.get('/api/admin/companies', auth.requireAuth, (req, res) => {
  try {
    const companies = db.prepare('SELECT * FROM companies ORDER BY name').all();
    res.json(companies);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/companies/:id', auth.requireAuth, validators.idParam, (req, res) => {
  try {
    const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.id);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }
    res.json(company);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/companies', auth.requireAuth, validators.createCompany, (req, res) => {
  try {
    const { name, street, house_number, postal_code, city, tax_number, vat_id, bank_account, email } = req.body;

    const result = db.prepare(`
      INSERT INTO companies (name, street, house_number, postal_code, city, tax_number, vat_id, bank_account, email)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(name, street, house_number, postal_code, city, tax_number || '', vat_id || '', bank_account || '', email || null);

    auth.logAudit(db, req.user.role, 'company_created', 'company', result.lastInsertRowid, { name }, req.ip, req.get('user-agent'));

    res.json({ success: true, id: result.lastInsertRowid });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint')) {
      res.status(400).json({ error: 'Company name already exists' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

app.put('/api/admin/companies/:id', auth.requireAuth, validators.idParam, validators.createCompany, (req, res) => {
  try {
    const { name, street, house_number, postal_code, city, tax_number, vat_id, bank_account, email } = req.body;

    const result = db.prepare(`
      UPDATE companies
      SET name = ?, street = ?, house_number = ?, postal_code = ?, city = ?,
          tax_number = ?, vat_id = ?, bank_account = ?, email = ?
      WHERE id = ?
    `).run(name, street, house_number, postal_code, city, tax_number || '', vat_id || '', bank_account || '', email || null, req.params.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    auth.logAudit(db, req.user.role, 'company_updated', 'company', req.params.id, { name }, req.ip, req.get('user-agent'));

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/admin/companies/:id', auth.requireAuth, validators.idParam, (req, res) => {
  try {
    const force = req.query.force === 'true';
    const locationCount = db.prepare('SELECT COUNT(*) as count FROM locations WHERE company_id = ?').get(req.params.id).count;

    if (locationCount > 0 && !force) {
      return res.status(409).json({
        error: `Firma hat ${locationCount} Standort(e). Trotzdem löschen?`,
        hasLocations: true,
        locationCount
      });
    }

    const deleteAll = db.transaction(() => {
      const locationIds = db.prepare('SELECT id FROM locations WHERE company_id = ?').all(req.params.id).map(r => r.id);
      for (const locId of locationIds) {
        db.prepare('DELETE FROM bookings WHERE location_id = ?').run(locId);
        db.prepare('DELETE FROM invite_tokens WHERE location_id = ?').run(locId);
        db.prepare('DELETE FROM location_blackouts WHERE location_id = ?').run(locId);
        db.prepare('DELETE FROM pricing_rules WHERE location_id = ?').run(locId);
        db.prepare('DELETE FROM pricing_overrides WHERE location_id = ?').run(locId);
        db.prepare('DELETE FROM discounts WHERE location_id = ?').run(locId);
      }
      db.prepare('DELETE FROM locations WHERE company_id = ?').run(req.params.id);
      db.prepare('DELETE FROM companies WHERE id = ?').run(req.params.id);
    });
    deleteAll();

    auth.logAudit(db, req.user.role, 'company_deleted', 'company', req.params.id, { locationsDeleted: locationCount }, req.ip, req.get('user-agent'));

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== LOCATIONS CRUD ====================

app.get('/api/admin/locations', auth.requireAuth, (req, res) => {
  try {
    const locations = db.prepare(`
      SELECT l.*, c.name as company_name
      FROM locations l
      LEFT JOIN companies c ON l.company_id = c.id
      ORDER BY l.name
    `).all();
    res.json(locations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/locations/:id', auth.requireAuth, validators.idParam, (req, res) => {
  try {
    const location = db.prepare(`
      SELECT l.*, c.name as company_name
      FROM locations l
      LEFT JOIN companies c ON l.company_id = c.id
      WHERE l.id = ?
    `).get(req.params.id);

    if (!location) {
      return res.status(404).json({ error: 'Location not found' });
    }
    res.json(location);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/locations', auth.requireAuth, validators.createLocation, (req, res) => {
  try {
    const { name, address, building_specification, category, company_id, access_code } = req.body;

    const result = db.prepare(`
      INSERT INTO locations (name, address, building_specification, category, company_id, access_code)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(name, address, building_specification || '', category, company_id || null, access_code || null);

    auth.logAudit(db, req.user.role, 'location_created', 'location', result.lastInsertRowid, { name }, req.ip, req.get('user-agent'));

    res.json({ success: true, id: result.lastInsertRowid });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/admin/locations/:id', auth.requireAuth, validators.idParam, validators.createLocation, (req, res) => {
  try {
    const { name, address, building_specification, category, company_id, access_code } = req.body;

    const result = db.prepare(`
      UPDATE locations
      SET name = ?, address = ?, building_specification = ?, category = ?, company_id = ?, access_code = ?
      WHERE id = ?
    `).run(name, address, building_specification || '', category, company_id || null, access_code || null, req.params.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Location not found' });
    }

    auth.logAudit(db, req.user.role, 'location_updated', 'location', req.params.id, { name }, req.ip, req.get('user-agent'));

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/admin/locations/:id', auth.requireAuth, validators.idParam, (req, res) => {
  try {
    const force = req.query.force === 'true';
    const bookingCount = db.prepare('SELECT COUNT(*) as count FROM bookings WHERE location_id = ?').get(req.params.id).count;

    if (bookingCount > 0 && !force) {
      return res.status(409).json({
        error: `Standort hat ${bookingCount} Buchung(en). Trotzdem löschen?`,
        hasBookings: true,
        bookingCount
      });
    }

    const deleteAll = db.transaction(() => {
      db.prepare('DELETE FROM bookings WHERE location_id = ?').run(req.params.id);
      db.prepare('DELETE FROM invite_tokens WHERE location_id = ?').run(req.params.id);
      db.prepare('DELETE FROM location_blackouts WHERE location_id = ?').run(req.params.id);
      db.prepare('DELETE FROM pricing_rules WHERE location_id = ?').run(req.params.id);
      db.prepare('DELETE FROM pricing_overrides WHERE location_id = ?').run(req.params.id);
      db.prepare('DELETE FROM discounts WHERE location_id = ?').run(req.params.id);
      db.prepare('DELETE FROM locations WHERE id = ?').run(req.params.id);
    });
    deleteAll();

    auth.logAudit(db, req.user.role, 'location_deleted', 'location', req.params.id, { bookingsDeleted: bookingCount }, req.ip, req.get('user-agent'));

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== PRICING (Formula-based) ====================

// GET current base price and full price table
app.get('/api/admin/pricing/config', auth.requireAuth, (req, res) => {
  try {
    const basePrice = pricing.getBasePrice(db);
    const vehicleTypes = db.prepare('SELECT * FROM vehicle_types ORDER BY max_length').all();
    const categories = ['indoor', 'covered', 'outside'];

    const priceTable = [];
    vehicleTypes.forEach(vt => {
      const row = {
        vehicle_type_id: vt.id,
        vehicle_label: vt.label,
        max_length: vt.max_length
      };
      categories.forEach(cat => {
        row[cat] = pricing.calculateFormulaPrice(basePrice, vt.max_length, cat);
      });
      priceTable.push(row);
    });

    res.json({
      base_price: basePrice,
      category_factors: pricing.CATEGORY_FACTORS,
      length_threshold: pricing.LENGTH_THRESHOLD,
      length_step: pricing.LENGTH_STEP,
      surcharge_per_step: pricing.SURCHARGE_PER_STEP,
      price_table: priceTable
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT update base price
app.put('/api/admin/pricing/config', auth.requireAuth, (req, res) => {
  try {
    const { base_price } = req.body;

    if (base_price == null || isNaN(base_price) || base_price < 0) {
      return res.status(400).json({ error: 'Valid base_price required (>= 0)' });
    }

    db.prepare("UPDATE settings SET value = ?, updated_at = datetime('now') WHERE key = 'base_price'").run(String(base_price));

    auth.logAudit(db, req.user.role, 'base_price_updated', 'settings', null, { base_price }, req.ip, req.get('user-agent'));

    res.json({ success: true, base_price: parseFloat(base_price) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== PRICING OVERRIDES ====================

app.get('/api/admin/pricing/overrides', auth.requireAuth, (req, res) => {
  try {
    const overrides = db.prepare(`
      SELECT po.*, l.name as location_name, vt.label as vehicle_label
      FROM pricing_overrides po
      JOIN locations l ON po.location_id = l.id
      JOIN vehicle_types vt ON po.vehicle_type_id = vt.id
      ORDER BY po.valid_from DESC
    `).all();
    res.json(overrides);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/pricing/overrides', auth.requireAuth, validators.createPricingOverride, (req, res) => {
  try {
    const { location_id, vehicle_type_id, category, override_price, valid_from, valid_to, reason } = req.body;

    const result = db.prepare(`
      INSERT INTO pricing_overrides (location_id, vehicle_type_id, category, override_price, valid_from, valid_to, reason)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(location_id, vehicle_type_id, category, override_price, valid_from, valid_to, reason || null);

    auth.logAudit(db, req.user.role, 'pricing_override_created', 'pricing_override', result.lastInsertRowid, { override_price }, req.ip, req.get('user-agent'));

    res.json({ success: true, id: result.lastInsertRowid });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/admin/pricing/overrides/:id', auth.requireAuth, validators.idParam, (req, res) => {
  try {
    const result = db.prepare('DELETE FROM pricing_overrides WHERE id = ?').run(req.params.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Pricing override not found' });
    }

    auth.logAudit(db, req.user.role, 'pricing_override_deleted', 'pricing_override', req.params.id, null, req.ip, req.get('user-agent'));

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== DISCOUNTS ====================

app.get('/api/admin/discounts', auth.requireAuth, (req, res) => {
  try {
    const discounts = db.prepare(`
      SELECT d.*, l.name as location_name
      FROM discounts d
      LEFT JOIN locations l ON d.location_id = l.id
      ORDER BY d.created_at DESC
    `).all();
    res.json(discounts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/discounts', auth.requireAuth, validators.createDiscount, (req, res) => {
  try {
    const { code, discount_type, value, valid_from, valid_to, location_id, usage_limit } = req.body;

    const result = db.prepare(`
      INSERT INTO discounts (code, discount_type, value, valid_from, valid_to, location_id, usage_limit)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(code.toUpperCase(), discount_type, value, valid_from || null, valid_to || null, location_id || null, usage_limit || null);

    auth.logAudit(db, req.user.role, 'discount_created', 'discount', result.lastInsertRowid, { code }, req.ip, req.get('user-agent'));

    res.json({ success: true, id: result.lastInsertRowid });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint')) {
      res.status(400).json({ error: 'Discount code already exists' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

app.put('/api/admin/discounts/:id/toggle', auth.requireAuth, validators.idParam, (req, res) => {
  try {
    const discount = db.prepare('SELECT is_active FROM discounts WHERE id = ?').get(req.params.id);

    if (!discount) {
      return res.status(404).json({ error: 'Discount not found' });
    }

    const newState = discount.is_active === 1 ? 0 : 1;
    db.prepare('UPDATE discounts SET is_active = ? WHERE id = ?').run(newState, req.params.id);

    auth.logAudit(db, req.user.role, 'discount_toggled', 'discount', req.params.id, { is_active: newState }, req.ip, req.get('user-agent'));

    res.json({ success: true, is_active: newState });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/admin/discounts/:id', auth.requireAuth, validators.idParam, (req, res) => {
  try {
    const result = db.prepare('DELETE FROM discounts WHERE id = ?').run(req.params.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Discount not found' });
    }

    auth.logAudit(db, req.user.role, 'discount_deleted', 'discount', req.params.id, null, req.ip, req.get('user-agent'));

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== BLACKOUTS ====================

app.get('/api/admin/blackouts', auth.requireAuth, (req, res) => {
  try {
    const blackouts = db.prepare(`
      SELECT lb.*, l.name as location_name
      FROM location_blackouts lb
      JOIN locations l ON lb.location_id = l.id
      ORDER BY lb.start_date DESC
    `).all();
    res.json(blackouts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/blackouts', auth.requireAuth, validators.createBlackout, (req, res) => {
  try {
    const { location_id, start_date, end_date, reason } = req.body;

    const result = db.prepare(`
      INSERT INTO location_blackouts (location_id, start_date, end_date, reason)
      VALUES (?, ?, ?, ?)
    `).run(location_id, start_date, end_date, reason || null);

    auth.logAudit(db, req.user.role, 'blackout_created', 'blackout', result.lastInsertRowid, { location_id }, req.ip, req.get('user-agent'));

    res.json({ success: true, id: result.lastInsertRowid });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/admin/blackouts/:id', auth.requireAuth, validators.idParam, (req, res) => {
  try {
    const result = db.prepare('DELETE FROM location_blackouts WHERE id = ?').run(req.params.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Blackout not found' });
    }

    auth.logAudit(db, req.user.role, 'blackout_deleted', 'blackout', req.params.id, null, req.ip, req.get('user-agent'));

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== CONTRACT TEMPLATES ====================

app.get('/api/admin/templates', auth.requireAuth, (req, res) => {
  try {
    const templates = db.prepare('SELECT * FROM contract_templates ORDER BY scope_type, version DESC').all();
    res.json(templates);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/templates', auth.requireAuth, validators.createTemplate, (req, res) => {
  try {
    const { name, scope_type, scope_id, body_md } = req.body;

    // Get next version number for this template name
    const maxVersion = db.prepare('SELECT MAX(version) as max FROM contract_templates WHERE name = ?').get(name);
    const nextVersion = (maxVersion?.max || 0) + 1;

    const result = db.prepare(`
      INSERT INTO contract_templates (name, scope_type, scope_id, body_md, version, is_active)
      VALUES (?, ?, ?, ?, ?, 0)
    `).run(name, scope_type, scope_id || null, body_md, nextVersion);

    auth.logAudit(db, req.user.role, 'template_created', 'template', result.lastInsertRowid, { name, version: nextVersion }, req.ip, req.get('user-agent'));

    res.json({ success: true, id: result.lastInsertRowid, version: nextVersion });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/admin/templates/:id/activate', auth.requireAuth, validators.idParam, (req, res) => {
  try {
    const template = db.prepare('SELECT * FROM contract_templates WHERE id = ?').get(req.params.id);

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Deactivate all templates of the same scope type and scope_id
    db.prepare(`
      UPDATE contract_templates
      SET is_active = 0
      WHERE scope_type = ? AND (scope_id = ? OR (scope_id IS NULL AND ? IS NULL))
    `).run(template.scope_type, template.scope_id, template.scope_id);

    // Activate this template
    db.prepare('UPDATE contract_templates SET is_active = 1, updated_at = datetime(\'now\') WHERE id = ?').run(req.params.id);

    auth.logAudit(db, req.user.role, 'template_activated', 'template', req.params.id, { name: template.name }, req.ip, req.get('user-agent'));

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== INVITE TOKENS ====================

app.post('/api/admin/invite-tokens', auth.requireAuth, validators.createInviteToken, (req, res) => {
  try {
    const { location_id, vehicle_type_id, category, prefill_email, expires_in_hours } = req.body;

    // Generate unique token
    const token = crypto.randomBytes(32).toString('hex');

    // Calculate expiry
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + (expires_in_hours || 72)); // Default 72 hours

    const result = db.prepare(`
      INSERT INTO invite_tokens (token, location_id, vehicle_type_id, category, prefill_email, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(token, location_id || null, vehicle_type_id || null, category || null, prefill_email || null, expiresAt.toISOString());

    auth.logAudit(db, req.user.role, 'invite_token_created', 'invite_token', result.lastInsertRowid, null, req.ip, req.get('user-agent'));

    // Generate invite URL
    const baseUrl = req.protocol + '://' + req.get('host');
    const inviteUrl = `${baseUrl}/booking?invite=${token}`;

    res.json({ success: true, id: result.lastInsertRowid, token, inviteUrl, expiresAt });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET invite token details (public endpoint)
app.get('/api/invite/:token', (req, res) => {
  try {
    const invite = db.prepare(`
      SELECT *
      FROM invite_tokens
      WHERE token = ? AND used_at IS NULL AND expires_at > datetime('now')
    `).get(req.params.token);

    if (!invite) {
      return res.status(404).json({ error: 'Invalid or expired invitation' });
    }

    res.json({
      location_id: invite.location_id,
      vehicle_type_id: invite.vehicle_type_id,
      category: invite.category,
      prefill_email: invite.prefill_email
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== AUDIT LOG ====================

app.get('/api/admin/audit-log', auth.requireAuth, (req, res) => {
  try {
    const { limit = 100, offset = 0 } = req.query;

    const logs = db.prepare(`
      SELECT * FROM audit_log
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(parseInt(limit), parseInt(offset));

    const total = db.prepare('SELECT COUNT(*) as count FROM audit_log').get().count;

    res.json({ logs, total, limit, offset });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== CLEANUP TASK ====================

// Cleanup old temporary PDF files
const cleanupTempFiles = () => {
  try {
    const tempDir = './temp';
    if (!fs.existsSync(tempDir)) return;

    const files = fs.readdirSync(tempDir);
    const now = Date.now();
    const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days

    files.forEach(file => {
      const filePath = path.join(tempDir, file);
      const stats = fs.statSync(filePath);
      const age = now - stats.mtimeMs;

      if (age > maxAge) {
        fs.unlinkSync(filePath);
        console.log(`Cleaned up old file: ${file}`);
      }
    });
  } catch (error) {
    console.error('Cleanup error:', error);
  }
};

// Run cleanup daily
setInterval(cleanupTempFiles, 24 * 60 * 60 * 1000);

// ==================== INIT & START ====================

// Create temp directory if it doesn't exist
if (!fs.existsSync('./temp')) {
  fs.mkdirSync('./temp');
}

// Initialize vehicle types from config if needed
const initializeData = () => {
  try {
    const config = require('./config');

    config.VEHICLE_TYPES.forEach(vt => {
      const exists = db.prepare('SELECT id FROM vehicle_types WHERE max_length = ?').get(vt.max_length);
      if (!exists) {
        db.prepare('INSERT INTO vehicle_types (max_length, label) VALUES (?, ?)').run(vt.max_length, vt.label);
      }
    });

    console.log('✓ Database initialized');
  } catch (error) {
    console.error('Initialization error:', error);
  }
};

initializeData();

app.listen(PORT, () => {
  console.log(`\n🚀 Server v2.0 running on http://localhost:${PORT}`);
  console.log(`📊 Database: SQLite (WAL mode)`);
  console.log(`🔒 JWT Authentication: Enabled`);
  console.log(`🛡️  Rate Limiting: Enabled`);
  console.log(`✅ Ready for requests\n`);
});
