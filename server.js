const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const db = require('./database');
const config = require('./config');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static('public'));

// ==================== ROUTES ====================

// Root route - redirect to homepage
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==================== API - BOOKING ====================

// GET alle Locations (public endpoint for booking form)
app.get('/api/locations', (req, res) => {
  const locations = db.prepare(`
    SELECT l.*, c.name as company_name
    FROM locations l
    LEFT JOIN companies c ON l.company_id = c.id
    ORDER BY l.name
  `).all();
  res.json(locations);
});

// GET Pricing für eine Location
app.get('/api/pricing/:locationId', (req, res) => {
  const { locationId } = req.params;
  
  const pricing = db.prepare(`
    SELECT p.*, vt.label, vt.max_length
    FROM pricing p
    JOIN vehicle_types vt ON p.vehicle_type_id = vt.id
    WHERE p.location_id = ?
    ORDER BY vt.max_length
  `).all(locationId);

  res.json(pricing);
});

// POST Booking erstellen
app.post('/api/bookings', (req, res) => {
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
      monthlyPrice,
      caution,
      customerSignatureImage,
      customerSignatureSVG
    } = req.body;

    // Get category from location
    const location = db.prepare('SELECT category FROM locations WHERE id = ?').get(locationId);
    if (!location) {
      return res.status(400).json({ success: false, error: 'Invalid location' });
    }

    const stmt = db.prepare(`
      INSERT INTO bookings (
        location_id, vehicle_type_id, category,
        first_name, last_name, address, email,
        start_date, end_date,
        monthly_price, caution,
        customer_signature_image,
        customer_signature_svg,
        customer_signature_date,
        status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), 'pending_owner_signature')
    `);

    const result = stmt.run(
      locationId, vehicleTypeId, location.category,
      firstName, lastName, address, email,
      startDate, endDate,
      monthlyPrice, caution,
      customerSignatureImage,
      customerSignatureSVG
    );

    res.json({ success: true, bookingId: result.lastInsertRowid });
  } catch (error) {
    console.error('Booking error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET Booking Details
app.get('/api/bookings/:bookingId', (req, res) => {
  const { bookingId } = req.params;
  
  const booking = db.prepare(`
    SELECT 
      b.*,
      l.name as location_name,
      l.company as company,
      l.city as city,
      vt.label as vehicle_label,
      vt.max_length
    FROM bookings b
    JOIN locations l ON b.location_id = l.id
    JOIN vehicle_types vt ON b.vehicle_type_id = vt.id
    WHERE b.id = ?
  `).get(bookingId);

  if (!booking) {
    return res.status(404).json({ error: 'Booking nicht gefunden' });
  }

  res.json(booking);
});

// POST Vertragsunterschrift (Kunde)
app.post('/api/bookings/:bookingId/sign-customer', (req, res) => {
  try {
    const { bookingId } = req.params;
    const { signatureImage } = req.body;

    const stmt = db.prepare(`
      UPDATE bookings
      SET customer_signature_image = ?,
          customer_signature_date = datetime('now'),
          status = 'pending_owner_signature'
      WHERE id = ?
    `);

    stmt.run(signatureImage, bookingId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== API - ADMIN ====================

// GET Admin Dashboard Daten
app.get('/api/admin/dashboard', (req, res) => {
  // Einfache Authentifizierung (später: richtige Auth implementieren)
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${process.env.ADMIN_TOKEN || 'admin123'}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const stats = {
    totalBookings: db.prepare('SELECT COUNT(*) as count FROM bookings').get().count,
    pendingCustomerSignature: db.prepare("SELECT COUNT(*) as count FROM bookings WHERE status = 'pending_customer_signature'").get().count,
    pendingOwnerSignature: db.prepare("SELECT COUNT(*) as count FROM bookings WHERE status = 'pending_owner_signature'").get().count,
    completed: db.prepare("SELECT COUNT(*) as count FROM bookings WHERE status = 'completed'").get().count
  };

  const recentBookings = db.prepare(`
    SELECT b.*, l.name, vt.max_length
    FROM bookings b
    JOIN locations l ON b.location_id = l.id
    JOIN vehicle_types vt ON b.vehicle_type_id = vt.id
    ORDER BY b.created_at DESC
    LIMIT 10
  `).all();

  res.json({ stats, recentBookings });
});

// GET alle Bookings für Admin
app.get('/api/admin/bookings', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${process.env.ADMIN_TOKEN || 'admin123'}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const bookings = db.prepare(`
    SELECT b.*, l.name as location_name, vt.max_length as vehicle_length
    FROM bookings b
    JOIN locations l ON b.location_id = l.id
    JOIN vehicle_types vt ON b.vehicle_type_id = vt.id
    ORDER BY b.created_at DESC
  `).all();

  res.json(bookings);
});

// POST Owner Unterschrift
app.post('/api/admin/bookings/:bookingId/sign-owner', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${process.env.ADMIN_TOKEN || 'admin123'}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { bookingId } = req.params;
    const { signatureImage, signatureSVG } = req.body;

    const stmt = db.prepare(`
      UPDATE bookings
      SET owner_signature_image = ?,
          owner_signature_svg = ?,
          owner_signature_date = datetime('now'),
          status = 'completed'
      WHERE id = ?
    `).run(signatureImage, signatureSVG, bookingId);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== API - COMPANIES CRUD ====================

// Middleware für Admin-Auth
const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${process.env.ADMIN_TOKEN || 'admin123'}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

// GET alle Companies
app.get('/api/admin/companies', requireAuth, (req, res) => {
  try {
    const companies = db.prepare('SELECT * FROM companies ORDER BY name').all();
    res.json(companies);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET eine Company
app.get('/api/admin/companies/:id', requireAuth, (req, res) => {
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

// POST neue Company
app.post('/api/admin/companies', requireAuth, (req, res) => {
  try {
    const { name, street, house_number, postal_code, city, tax_number, vat_id, bank_account } = req.body;

    if (!name || !street || !house_number || !postal_code || !city) {
      return res.status(400).json({ error: 'Name, Straße, Hausnummer, PLZ und Ort sind erforderlich' });
    }

    const result = db.prepare(`
      INSERT INTO companies (name, street, house_number, postal_code, city, tax_number, vat_id, bank_account)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(name, street, house_number, postal_code, city, tax_number || '', vat_id || '', bank_account || '');

    res.json({ success: true, id: result.lastInsertRowid });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint')) {
      res.status(400).json({ error: 'Company name already exists' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// PUT Company aktualisieren
app.put('/api/admin/companies/:id', requireAuth, (req, res) => {
  try {
    const { name, street, house_number, postal_code, city, tax_number, vat_id, bank_account } = req.body;

    if (!name || !street || !house_number || !postal_code || !city) {
      return res.status(400).json({ error: 'Name, Straße, Hausnummer, PLZ und Ort sind erforderlich' });
    }

    const result = db.prepare(`
      UPDATE companies
      SET name = ?, street = ?, house_number = ?, postal_code = ?, city = ?,
          tax_number = ?, vat_id = ?, bank_account = ?
      WHERE id = ?
    `).run(name, street, house_number, postal_code, city, tax_number || '', vat_id || '', bank_account || '', req.params.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    res.json({ success: true });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint')) {
      res.status(400).json({ error: 'Company name already exists' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// DELETE Company
app.delete('/api/admin/companies/:id', requireAuth, (req, res) => {
  try {
    const result = db.prepare('DELETE FROM companies WHERE id = ?').run(req.params.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== API - LOCATIONS CRUD ====================

// GET alle Locations (mit Company-Info)
app.get('/api/admin/locations', requireAuth, (req, res) => {
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

// GET eine Location
app.get('/api/admin/locations/:id', requireAuth, (req, res) => {
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

// POST neue Location
app.post('/api/admin/locations', requireAuth, (req, res) => {
  try {
    const { name, address, building_specification, category, company_id } = req.body;

    if (!name || !address || !category) {
      return res.status(400).json({ error: 'Name, address and category are required' });
    }

    if (!['outside', 'covered', 'indoor'].includes(category)) {
      return res.status(400).json({ error: 'Invalid category. Must be: outside, covered, or indoor' });
    }

    const result = db.prepare(`
      INSERT INTO locations (name, address, building_specification, category, company_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(name, address, building_specification || '', category, company_id || null);

    res.json({ success: true, id: result.lastInsertRowid });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT Location aktualisieren
app.put('/api/admin/locations/:id', requireAuth, (req, res) => {
  try {
    const { name, address, building_specification, category, company_id } = req.body;

    if (!name || !address || !category) {
      return res.status(400).json({ error: 'Name, address and category are required' });
    }

    if (!['outside', 'covered', 'indoor'].includes(category)) {
      return res.status(400).json({ error: 'Invalid category. Must be: outside, covered, or indoor' });
    }

    const result = db.prepare(`
      UPDATE locations
      SET name = ?, address = ?, building_specification = ?, category = ?, company_id = ?
      WHERE id = ?
    `).run(name, address, building_specification || '', category, company_id || null, req.params.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Location not found' });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE Location
app.delete('/api/admin/locations/:id', requireAuth, (req, res) => {
  try {
    const result = db.prepare('DELETE FROM locations WHERE id = ?').run(req.params.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Location not found' });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== CONTRACT PREVIEW (HTML) ====================

app.get('/api/contract-preview/:bookingId', (req, res) => {
  try {
    const booking = db.prepare(`
      SELECT
        b.*,
        l.name as location_name,
        l.address as location_address,
        l.building_specification,
        l.category,
        c.name as company_name,
        c.street as company_street,
        c.house_number as company_house_number,
        c.postal_code as company_postal_code,
        c.city as company_city,
        c.tax_number as company_tax_number,
        c.vat_id as company_vat_id,
        c.bank_account as company_bank_account,
        vt.label as vehicle_label,
        vt.max_length as vehicle_length
      FROM bookings b
      JOIN locations l ON b.location_id = l.id
      LEFT JOIN companies c ON l.company_id = c.id
      JOIN vehicle_types vt ON b.vehicle_type_id = vt.id
      WHERE b.id = ?
    `).get(req.params.bookingId);

    if (!booking) {
      return res.status(404).send('<h1>Booking nicht gefunden</h1>');
    }

    // Helper for formatted dates
    const startDate = new Date(booking.start_date).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' });
    const endDate = new Date(booking.end_date).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' });
    const today = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' });

    // Calculate VAT
    const netPrice = booking.monthly_price;
    const vatAmount = netPrice * 0.19;
    const grossPrice = netPrice + vatAmount;

    // Category labels
    const categoryLabels = {
      'outside': 'Außenstellplatz',
      'covered': 'Überdacht',
      'indoor': 'Halle'
    };

    const html = `
<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Stellplatzmietvertrag - Vorschau</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            max-width: 800px;
            margin: 20px auto;
            padding: 40px;
            background: #f5f5f5;
            line-height: 1.6;
        }
        .contract {
            background: white;
            padding: 60px;
            box-shadow: 0 0 20px rgba(0,0,0,0.1);
        }
        h1 {
            text-align: center;
            color: #2c3e50;
            margin-bottom: 30px;
            font-size: 24px;
        }
        h2 {
            color: #34495e;
            margin-top: 25px;
            margin-bottom: 10px;
            font-size: 14px;
        }
        p {
            margin: 8px 0;
            font-size: 11px;
            text-align: justify;
        }
        .parties {
            margin: 20px 0;
            font-size: 11px;
        }
        .parties strong {
            display: block;
            margin-bottom: 5px;
        }
        .signature-section {
            margin-top: 40px;
            border-top: 2px solid #ddd;
            padding-top: 20px;
        }
        .signature-box {
            margin: 20px 0;
            padding: 15px;
            background: #f9f9f9;
            border: 1px solid #ddd;
            border-radius: 4px;
        }
        .signature-box h3 {
            margin: 0 0 10px 0;
            font-size: 12px;
            color: #555;
        }
        .signature-image {
            margin: 10px 0;
            padding: 10px;
            background: white;
            border: 1px solid #ccc;
            min-height: 60px;
            display: flex;
            align-items: center;
        }
        .signature-image svg {
            max-width: 200px;
            max-height: 50px;
        }
        .signature-line {
            border-bottom: 1px solid #333;
            width: 300px;
            margin: 20px 0 5px 0;
        }
        .date-info {
            font-size: 10px;
            color: #666;
        }
        .info-badge {
            display: inline-block;
            background: #3498db;
            color: white;
            padding: 5px 10px;
            border-radius: 4px;
            font-size: 11px;
            margin: 10px 0;
        }
    </style>
</head>
<body>
    <div class="contract">
        <h1>Stellplatzmietvertrag (temporär)</h1>

        <div class="parties">
            <strong>zwischen</strong>
            <p><strong>Vermieter:</strong> ${booking.company_name}, ${booking.company_street} ${booking.company_house_number}, ${booking.company_postal_code} ${booking.company_city}, E-Mail: info@${booking.company_name.toLowerCase().replace(/\s+/g, '-')}.de</p>
            <strong>und</strong>
            <p><strong>Mieter:</strong> ${booking.first_name} ${booking.last_name}, ${booking.address}, E-Mail: ${booking.email}</p>
        </div>

        <h2>§1 Mietgegenstand</h2>
        <p>(1) Vermietet wird ein Stellplatz am Standort ${booking.location_address}, ${categoryLabels[booking.category]} (nachfolgend „Stellplatz").</p>
        <p>(2) Der Stellplatz dient ausschließlich zum Abstellen des folgenden Fahrzeugs/Bootes: ${booking.vehicle_label}, Maße (L×B×H): bis ${booking.vehicle_length}m Länge.</p>

        <h2>§2 Mietzeit / Kündigung</h2>
        <p>(1) Mietbeginn: ${startDate}, Mietende: ${endDate}</p>
        <p>(2) Eine Untervermietung ist ausgeschlossen. Eine Wohnnutzung/Übernachtung ist untersagt.</p>

        <h2>§3 Miete / Zahlung / Kaution</h2>
        <p>(1) Miete: € ${netPrice.toFixed(2)} monatlich (Netto) + € ${vatAmount.toFixed(2)} (19% MwSt.) = € ${grossPrice.toFixed(2)} (Brutto).</p>
        <p>(2) Fälligkeit: monatlich zum 1. des Monats (Vorkasse).</p>
        <p>(3) Kaution: € ${booking.caution.toFixed(2)}, zahlbar vor Übergabe.</p>

        <h2>§4 Nutzungsvorgaben / Hausordnung</h2>
        <p>(1) Verboten sind: Lagerung von Gefahrstoffen, Arbeiten mit offener Flamme, Flüssiggasbetrieb in geschlossenen Bereichen, umweltgefährdende Leckagen.</p>
        <p>(2) Der Mieter hält den Stellplatz sauber und meldet Schäden unverzüglich.</p>

        <h2>§5 Zugang / Schlüsseltresor</h2>
        <p>(1) Zugang erfolgt über Schlüsseltresor, Code wird separat mitgeteilt. Der Code ist vertraulich zu behandeln.</p>
        <p>(2) Verlust/Missbrauch führt zu Kostenersatz (Schließung/Neucodierung).</p>

        <h2>§6 Haftung / Versicherung</h2>
        <p>(1) Keine Bewachung/Verwahrung. Der Vermieter schuldet keine Überwachung des Stellplatzes oder des abgestellten Fahrzeugs/Boots.</p>
        <p>(2) Der Mieter ist verpflichtet, eine Haftpflichtversicherung zu unterhalten und auf Anforderung nachzuweisen.</p>
        <p>(3) Der Vermieter haftet nur für Vorsatz und grobe Fahrlässigkeit; bei einfacher Fahrlässigkeit nur bei Verletzung wesentlicher Vertragspflichten und begrenzt auf den vertragstypischen, vorhersehbaren Schaden.</p>
        <p>(4) Keine Haftung für Diebstahl, Vandalismus, Unwetter, Dritte.</p>

        <h2>§7 Schäden / Instandsetzung</h2>
        <p>(1) Beschädigungen am Gelände, Toren, Gebäuden oder Einrichtungen sind vom Mieter zu ersetzen.</p>
        <p>(2) Leckagen (Öl, Treibstoff etc.) sind sofort zu melden; Reinigungskosten trägt der Mieter.</p>

        <h2>§8 Vertragsbeendigung / Räumung</h2>
        <p>(1) Mit Ende der Mietzeit ist der Stellplatz vollständig zu räumen und besenrein zu hinterlassen.</p>
        <p>(2) Zurückgelassene Gegenstände können auf Kosten des Mieters entfernt werden.</p>

        <h2>§9 Datenschutz</h2>
        <p>(1) Der Vermieter verarbeitet personenbezogene Daten zur Vertragsdurchführung (Art. 6 Abs. 1 lit. b DSGVO).</p>
        <p>(2) Kamera-/Zutrittsprotokolle am Standort: Hinweis gemäß Aushang.</p>

        <h2>§10 Schlussbestimmungen</h2>
        <p>(1) Änderungen/Ergänzungen bedürfen der Textform.</p>
        <p>(2) Sollte eine Bestimmung unwirksam sein, bleibt der Vertrag im Übrigen wirksam.</p>
        <p>(3) Gerichtsstand: Sitz des Vermieters, sofern gesetzlich zulässig.</p>

        <h2>Widerruf / Verbraucherhinweis:</h2>
        <p>Sofern ein gesetzliches Widerrufsrecht besteht, beträgt die Frist 14 Tage ab Vertragsschluss; Muster-Widerrufsbelehrung in der Anlage. Wenn der Mietbeginn vor Ablauf der Frist liegt und Sie möchten, dass wir direkt starten, bestätigen Sie bitte im Formular die Ausführung vor Fristende; Ihnen ist bekannt, dass das Widerrufsrecht dann – soweit gesetzlich vorgesehen – erlöschen kann.</p>

        <p style="margin-top: 30px;"><strong>Ort/Datum:</strong> ${today}</p>

        <div class="signature-section">
            <h2>Unterschriften</h2>

            <div class="signature-box">
                <h3>Mieter:</h3>
                ${booking.customer_signature_svg ? `
                    <div class="signature-image">
                        ${booking.customer_signature_svg}
                    </div>
                ` : '<div class="signature-line"></div>'}
                <p class="date-info">${booking.first_name} ${booking.last_name}${booking.customer_signature_date ? ', ' + new Date(booking.customer_signature_date).toLocaleDateString('de-DE') : ''}</p>
            </div>

            <div class="signature-box">
                <h3>Vermieter:</h3>
                ${booking.owner_signature_svg ? `
                    <div class="signature-image">
                        ${booking.owner_signature_svg}
                    </div>
                ` : '<div class="signature-line"></div>'}
                <p class="date-info">${booking.company_name}${booking.owner_signature_date ? ', ' + new Date(booking.owner_signature_date).toLocaleDateString('de-DE') : ''}</p>
            </div>
        </div>

        ${booking.status === 'pending_owner_signature' ? '<div class="info-badge">⚠️ Warten auf Unterschrift des Vermieters</div>' : ''}
        ${booking.status === 'completed' ? '<div class="info-badge" style="background: #27ae60;">✓ Vertrag vollständig unterzeichnet</div>' : ''}
    </div>
</body>
</html>
    `;

    res.send(html);
  } catch (error) {
    console.error('Contract preview error:', error);
    res.status(500).send(`<h1>Fehler</h1><p>${error.message}</p>`);
  }
});

// ==================== PDF GENERATION ====================

// Helper function to render SVG signature on PDF
function renderSVGSignature(doc, svgString, x, y, scale = 0.3) {
  if (!svgString) return;

  try {
    // Extract path elements from SVG
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
}

app.get('/api/contract/:bookingId', (req, res) => {
  try {
    const booking = db.prepare(`
      SELECT
        b.*,
        l.name as location_name,
        l.address as location_address,
        l.building_specification,
        l.category,
        c.name as company_name,
        c.street as company_street,
        c.house_number as company_house_number,
        c.postal_code as company_postal_code,
        c.city as company_city,
        c.tax_number as company_tax_number,
        c.vat_id as company_vat_id,
        c.bank_account as company_bank_account,
        vt.label as vehicle_label,
        vt.max_length as vehicle_length
      FROM bookings b
      JOIN locations l ON b.location_id = l.id
      LEFT JOIN companies c ON l.company_id = c.id
      JOIN vehicle_types vt ON b.vehicle_type_id = vt.id
      WHERE b.id = ?
    `).get(req.params.bookingId);

    if (!booking) {
      return res.status(404).json({ error: 'Booking nicht gefunden' });
    }

    const doc = new PDFDocument({ bufferPages: true, margin: 50, size: 'A4' });
    const stream = fs.createWriteStream(`./temp/contract_${booking.id}.pdf`);

    doc.pipe(stream);

    // Helper for formatted dates
    const startDate = new Date(booking.start_date).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' });
    const endDate = new Date(booking.end_date).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' });
    const today = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' });

    // Calculate VAT
    const netPrice = booking.monthly_price;
    const vatAmount = netPrice * 0.19;
    const grossPrice = netPrice + vatAmount;

    // Category labels
    const categoryLabels = {
      'outside': 'Außenstellplatz',
      'covered': 'Überdacht',
      'indoor': 'Halle'
    };

    // Title
    doc.fontSize(16).font('Helvetica-Bold').text('Stellplatzmietvertrag (temporär)', { align: 'center' });
    doc.moveDown(0.5);

    // Parties
    doc.fontSize(10).font('Helvetica-Bold').text('zwischen');
    doc.moveDown(0.3);
    doc.font('Helvetica').text(`Vermieter: ${booking.company_name}, ${booking.company_street} ${booking.company_house_number}, ${booking.company_postal_code} ${booking.company_city}, E-Mail: info@${booking.company_name.toLowerCase().replace(/\s+/g, '-')}.de`);
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').text('und');
    doc.moveDown(0.3);
    doc.font('Helvetica').text(`Mieter: ${booking.first_name} ${booking.last_name}, ${booking.address}, E-Mail: ${booking.email}`);
    doc.moveDown(1);

    // §1 Mietgegenstand
    doc.fontSize(11).font('Helvetica-Bold').text('§1 Mietgegenstand');
    doc.fontSize(9).font('Helvetica');
    doc.text(`(1) Vermietet wird ein Stellplatz am Standort ${booking.location_address}, ${categoryLabels[booking.category]} (nachfolgend „Stellplatz").`);
    doc.text(`(2) Der Stellplatz dient ausschließlich zum Abstellen des folgenden Fahrzeugs/Bootes: ${booking.vehicle_label}, Maße (L×B×H): bis ${booking.vehicle_length}m Länge.`);
    doc.moveDown(0.7);

    // §2 Mietzeit / Kündigung
    doc.fontSize(11).font('Helvetica-Bold').text('§2 Mietzeit / Kündigung');
    doc.fontSize(9).font('Helvetica');
    doc.text(`(1) Mietbeginn: ${startDate}, Mietende: ${endDate}`);
    doc.text('(2) Eine Untervermietung ist ausgeschlossen. Eine Wohnnutzung/Übernachtung ist untersagt.');
    doc.moveDown(0.7);

    // §3 Miete / Zahlung / Kaution
    doc.fontSize(11).font('Helvetica-Bold').text('§3 Miete / Zahlung / Kaution');
    doc.fontSize(9).font('Helvetica');
    doc.text(`(1) Miete: € ${netPrice.toFixed(2)} monatlich (Netto) + € ${vatAmount.toFixed(2)} (19% MwSt.) = € ${grossPrice.toFixed(2)} (Brutto).`);
    doc.text('(2) Fälligkeit: monatlich zum 1. des Monats (Vorkasse).');
    doc.text(`(3) Kaution: € ${booking.caution.toFixed(2)}, zahlbar vor Übergabe.`);
    doc.moveDown(0.7);

    // §4 Nutzungsvorgaben / Hausordnung
    doc.fontSize(11).font('Helvetica-Bold').text('§4 Nutzungsvorgaben / Hausordnung');
    doc.fontSize(9).font('Helvetica');
    doc.text('(1) Verboten sind: Lagerung von Gefahrstoffen, Arbeiten mit offener Flamme, Flüssiggasbetrieb in geschlossenen Bereichen, umweltgefährdende Leckagen.');
    doc.text('(2) Der Mieter hält den Stellplatz sauber und meldet Schäden unverzüglich.');
    doc.moveDown(0.7);

    // §5 Zugang / Schlüsseltresor
    doc.fontSize(11).font('Helvetica-Bold').text('§5 Zugang / Schlüsseltresor');
    doc.fontSize(9).font('Helvetica');
    doc.text('(1) Zugang erfolgt über Schlüsseltresor, Code wird separat mitgeteilt. Der Code ist vertraulich zu behandeln.');
    doc.text('(2) Verlust/Missbrauch führt zu Kostenersatz (Schließung/Neucodierung).');
    doc.moveDown(0.7);

    // §6 Haftung / Versicherung
    doc.fontSize(11).font('Helvetica-Bold').text('§6 Haftung / Versicherung');
    doc.fontSize(9).font('Helvetica');
    doc.text('(1) Keine Bewachung/Verwahrung. Der Vermieter schuldet keine Überwachung des Stellplatzes oder des abgestellten Fahrzeugs/Boots.');
    doc.text('(2) Der Mieter ist verpflichtet, eine Haftpflichtversicherung zu unterhalten und auf Anforderung nachzuweisen.');
    doc.text('(3) Der Vermieter haftet nur für Vorsatz und grobe Fahrlässigkeit; bei einfacher Fahrlässigkeit nur bei Verletzung wesentlicher Vertragspflichten und begrenzt auf den vertragstypischen, vorhersehbaren Schaden.');
    doc.text('(4) Keine Haftung für Diebstahl, Vandalismus, Unwetter, Dritte.');
    doc.moveDown(0.7);

    // §7 Schäden / Instandsetzung
    doc.fontSize(11).font('Helvetica-Bold').text('§7 Schäden / Instandsetzung');
    doc.fontSize(9).font('Helvetica');
    doc.text('(1) Beschädigungen am Gelände, Toren, Gebäuden oder Einrichtungen sind vom Mieter zu ersetzen.');
    doc.text('(2) Leckagen (Öl, Treibstoff etc.) sind sofort zu melden; Reinigungskosten trägt der Mieter.');
    doc.moveDown(0.7);

    // §8 Vertragsbeendigung / Räumung
    doc.fontSize(11).font('Helvetica-Bold').text('§8 Vertragsbeendigung / Räumung');
    doc.fontSize(9).font('Helvetica');
    doc.text('(1) Mit Ende der Mietzeit ist der Stellplatz vollständig zu räumen und besenrein zu hinterlassen.');
    doc.text('(2) Zurückgelassene Gegenstände können auf Kosten des Mieters entfernt werden.');
    doc.moveDown(0.7);

    // §9 Datenschutz
    doc.fontSize(11).font('Helvetica-Bold').text('§9 Datenschutz');
    doc.fontSize(9).font('Helvetica');
    doc.text('(1) Der Vermieter verarbeitet personenbezogene Daten zur Vertragsdurchführung (Art. 6 Abs. 1 lit. b DSGVO).');
    doc.text('(2) Kamera-/Zutrittsprotokolle am Standort: Hinweis gemäß Aushang.');
    doc.moveDown(0.7);

    // §10 Schlussbestimmungen
    doc.fontSize(11).font('Helvetica-Bold').text('§10 Schlussbestimmungen');
    doc.fontSize(9).font('Helvetica');
    doc.text('(1) Änderungen/Ergänzungen bedürfen der Textform.');
    doc.text('(2) Sollte eine Bestimmung unwirksam sein, bleibt der Vertrag im Übrigen wirksam.');
    doc.text('(3) Gerichtsstand: Sitz des Vermieters, sofern gesetzlich zulässig.');
    doc.moveDown(1);

    // Widerruf
    doc.fontSize(9).font('Helvetica-Bold').text('Widerruf / Verbraucherhinweis:');
    doc.font('Helvetica').text('Sofern ein gesetzliches Widerrufsrecht besteht, beträgt die Frist 14 Tage ab Vertragsschluss; Muster-Widerrufsbelehrung in der Anlage. Wenn der Mietbeginn vor Ablauf der Frist liegt und Sie möchten, dass wir direkt starten, bestätigen Sie bitte im Formular die Ausführung vor Fristende; Ihnen ist bekannt, dass das Widerrufsrecht dann – soweit gesetzlich vorgesehen – erlöschen kann.');
    doc.moveDown(1.5);

    // Ort/Datum
    doc.fontSize(9).text(`Ort/Datum: ${today}`);
    doc.moveDown(1);

    // Unterschriften
    doc.fontSize(11).font('Helvetica-Bold').text('Unterschriften');
    doc.moveDown(0.5);

    // Mieter Unterschrift
    doc.fontSize(9).font('Helvetica').text('Mieter:');
    const mieterSignY = doc.y;

    if (booking.customer_signature_svg) {
      renderSVGSignature(doc, booking.customer_signature_svg, 70, mieterSignY, 0.25);
    }

    doc.y = mieterSignY + 40;
    doc.moveTo(70, doc.y).lineTo(270, doc.y).stroke();
    if (booking.customer_signature_date) {
      const sigDate = new Date(booking.customer_signature_date).toLocaleDateString('de-DE');
      doc.text(`(${booking.first_name} ${booking.last_name}, ${sigDate})`, 70, doc.y + 3);
    } else {
      doc.text(`(${booking.first_name} ${booking.last_name})`, 70, doc.y + 3);
    }

    doc.moveDown(2);

    // Vermieter Unterschrift
    doc.fontSize(9).font('Helvetica').text('Vermieter:');
    const vermieterSignY = doc.y;

    if (booking.owner_signature_svg) {
      renderSVGSignature(doc, booking.owner_signature_svg, 70, vermieterSignY, 0.25);
    }

    doc.y = vermieterSignY + 40;
    doc.moveTo(70, doc.y).lineTo(270, doc.y).stroke();
    if (booking.owner_signature_date) {
      const ownerSigDate = new Date(booking.owner_signature_date).toLocaleDateString('de-DE');
      doc.text(`(${booking.company_name}, ${ownerSigDate})`, 70, doc.y + 3);
    } else {
      doc.text(`(${booking.company_name})`, 70, doc.y + 3);
    }

    doc.end();

    stream.on('finish', () => {
      res.download(`./temp/contract_${booking.id}.pdf`, `vertrag_${booking.id}.pdf`);
    });

  } catch (error) {
    console.error('PDF Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== INIT & START ====================

// Initialisiere Fahrzeugtypen und Preise beim Start
function initializeData() {
  try {
    // Fahrzeugtypen einfügen (wenn nicht vorhanden)
    config.VEHICLE_TYPES.forEach(vt => {
      const exists = db.prepare('SELECT id FROM vehicle_types WHERE max_length = ?').get(vt.max_length);
      if (!exists) {
        db.prepare('INSERT INTO vehicle_types (max_length, label) VALUES (?, ?)').run(vt.max_length, vt.label);
      }
    });

    // Get all locations and vehicle types for pricing
    const locations = db.prepare('SELECT id FROM locations').all();
    const vehicleTypes = db.prepare('SELECT id, max_length FROM vehicle_types').all();
    const categories = ['outside', 'covered', 'indoor'];

    // Create pricing for all combinations if pricing table is empty
    const pricingCount = db.prepare('SELECT COUNT(*) as count FROM pricing').get().count;
    if (pricingCount === 0 && locations.length > 0) {
      console.log('Initializing pricing data...');

      locations.forEach(location => {
        vehicleTypes.forEach(vt => {
          categories.forEach(category => {
            const basePrice = config.BASE_PRICES[vt.max_length] || 100;
            const multiplier = config.CATEGORY_MULTIPLIERS[category] || 1.0;
            const price = basePrice * multiplier;

            try {
              db.prepare(`
                INSERT INTO pricing (location_id, vehicle_type_id, category, price_per_month)
                VALUES (?, ?, ?, ?)
              `).run(location.id, vt.id, category, price);
            } catch (e) {
              // Ignore duplicate errors
              if (!e.message.includes('UNIQUE')) {
                console.error('Error inserting pricing:', e.message);
              }
            }
          });
        });
      });

      console.log('✓ Pricing data initialized');
    }

    console.log('✓ Datenbank initialisiert');
  } catch (error) {
    console.error('Initialization error:', error);
  }
}

// Temp-Verzeichnis erstellen
if (!fs.existsSync('./temp')) {
  fs.mkdirSync('./temp');
}

initializeData();

app.listen(PORT, () => {
  console.log(`Server läuft auf http://localhost:${PORT}`);
});
