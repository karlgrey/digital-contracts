# 🤖 Claude Code Spezifikation - Stellplatz-Buchungssystem

**Ziel:** Vollständig automatisiertes Buchungssystem für temporäre Stellplatz-Vermietung (Wohnmobile, Boote) mit digitaler Vertragserstellung und Unterschriften.

---

## 📋 Anforderungen & Geschäftslogik

### Geschäftsmodell
- **3 Locations** in Brandenburg mit verschiedenen Preisen
- **2 unterschiedliche Firmen** (Firma A betreibt 2 Locations, Firma B eine)
- **Mietdauer:** Monatlich
- **Fahrzeugtypen:** 8 Größen (5,0m bis 8,5m)
- **Stellplatz-Kategorien:** Außen (50% Rabatt), Überdacht (75%), Halle (100%)
- **Zahlungsmodell:** Monatliche Miete + Kaution (1 Monatsmiete)
- **Extras:** Kein Strom, nur Abstellen möglich

### Preisstruktur (pro Monat, zzgl. 19% MwSt)
```
bis 5,00 m    → 100 €
bis 5,50 m    → 110 €
bis 6,00 m    → 115 €
bis 6,50 m    → 120 €
bis 7,00 m    → 130 €
bis 7,50 m    → 140 €
bis 8,00 m    → 150 €
bis 8,50 m    → 160 €

Kategorien:
- Außenstellplatz: 50% des Basispreises
- Überdacht: 75% des Basispreises
- In der Halle: 100% des Basispreises
```

### Workflow

**Phase 1: Kundenbuchung**
1. Kunde erhält Link mit vorausgewählter Location (z.B. `?location=1`)
2. Wählt: Fahrzeugtyp → Kategorie → Mietdauer (Start/Ende)
3. Gibt an: Vorname, Nachname, Adresse, Email
4. Unterschreibt digital (Canvas-Signatur)
5. System speichert alles mit digitaler Unterschrift

**Phase 2: Vermieter-Freigabe**
1. Du (Vermieter) gehst ins Admin-Panel
2. Schaust die Buchung & den generierten Vertrag an
3. Unterschreibst selbst digital
4. System generiert finales PDF mit beiden Unterschriften

---

## 🏗️ Technische Architektur

### Stack
- **Backend:** Node.js + Express.js
- **Datenbank:** SQLite3 (best-sqlite3)
- **PDF-Generator:** pdfkit
- **Frontend:** HTML5 + Vanilla JavaScript
- **Deployment:** PM2 auf Linux Server

### Verzeichnisstruktur
```
stellplatz-system/
├── server.js                    # Express Backend
├── database.js                  # SQLite Setup & Migrations
├── config.js                    # Fahrzeugtypen & Preise
├── utils/
│   ├── pdfGenerator.js         # PDF-Vertragsgeneration
│   └── signatureProcessor.js   # Signatur-Verarbeitung
├── public/
│   ├── booking.html            # Kundenformular
│   ├── admin.html              # Admin-Dashboard
│   └── assets/
│       ├── styles.css          # Gemeinsame Styles
│       └── libs/               # SignaturePad.js, etc.
├── temp/                        # Für temporäre PDFs
├── package.json
├── .env.example
├── README.md
├── QUICKSTART.md
├── SETUP-GUIDE.md
└── CLAUDE-CODE-SPEC.md         # Diese Datei
```

---

## 🗄️ Datenbank-Schema

### Tabelle: locations
```sql
CREATE TABLE locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,           -- "Potsdam", "Brandenburg", "Frankfurt/Oder"
  company TEXT NOT NULL,                -- "Firma A GmbH", "Firma B GmbH"
  city TEXT NOT NULL,                   -- Stadt für Verträge
  address TEXT,                         -- Vollständige Adresse
  phone TEXT,                           -- Telefon für Verträge
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Tabelle: vehicle_types
```sql
CREATE TABLE vehicle_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  max_length REAL NOT NULL UNIQUE,     -- 5.0, 5.5, 6.0, ..., 8.5
  label TEXT NOT NULL,                  -- "bis 5,00 m"
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Tabelle: pricing
```sql
CREATE TABLE pricing (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  location_id INTEGER NOT NULL,         -- FK zu locations
  vehicle_type_id INTEGER NOT NULL,     -- FK zu vehicle_types
  category TEXT NOT NULL,               -- 'outside', 'covered', 'indoor'
  price_per_month REAL NOT NULL,        -- Euro (zzgl. MwSt)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (location_id) REFERENCES locations(id),
  FOREIGN KEY (vehicle_type_id) REFERENCES vehicle_types(id),
  UNIQUE(location_id, vehicle_type_id, category)
);
```

### Tabelle: bookings
```sql
CREATE TABLE bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Buchungs-Referenzen
  location_id INTEGER NOT NULL,
  vehicle_type_id INTEGER NOT NULL,
  category TEXT NOT NULL,               -- 'outside', 'covered', 'indoor'
  
  -- Kundendaten
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  address TEXT NOT NULL,
  email TEXT NOT NULL,
  
  -- Mietdauer
  start_date DATE NOT NULL,             -- YYYY-MM-DD
  end_date DATE NOT NULL,               -- YYYY-MM-DD
  
  -- Preisberechnung
  monthly_price REAL NOT NULL,          -- Basis ohne MwSt
  caution REAL NOT NULL,                -- = monthly_price
  
  -- Status & Unterschriften
  status TEXT DEFAULT 'pending_customer_signature',
    -- pending_customer_signature
    -- pending_owner_signature
    -- completed
    -- cancelled
  
  customer_signature_image TEXT,        -- Base64 PNG
  customer_signature_date DATETIME,
  owner_signature_image TEXT,           -- Base64 PNG
  owner_signature_date DATETIME,
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (location_id) REFERENCES locations(id),
  FOREIGN KEY (vehicle_type_id) REFERENCES vehicle_types(id)
);
```

### Indizes
```sql
CREATE INDEX idx_bookings_location ON bookings(location_id);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_email ON bookings(email);
CREATE INDEX idx_pricing_location ON pricing(location_id);
```

---

## 🔌 API Specification

### Public Endpoints

#### GET /api/locations
Alle verfügbaren Locations mit Firma & Stadt
```json
Response 200:
[
  { "id": 1, "name": "Potsdam", "company": "Firma A GmbH", "city": "Potsdam" },
  { "id": 2, "name": "Brandenburg", "company": "Firma A GmbH", "city": "Brandenburg" },
  { "id": 3, "name": "Frankfurt/Oder", "company": "Firma B GmbH", "city": "Frankfurt/Oder" }
]
```

#### GET /api/pricing/:locationId
Alle Preis-Kombinationen für eine Location (mit Fahrzeugtyp-Info)
```json
Response 200:
[
  {
    "id": 1,
    "location_id": 1,
    "vehicle_type_id": 1,
    "category": "outside",
    "price_per_month": 50,
    "max_length": 5.0,
    "label": "bis 5,00 m"
  },
  {
    "id": 2,
    "location_id": 1,
    "vehicle_type_id": 1,
    "category": "covered",
    "price_per_month": 75,
    "max_length": 5.0,
    "label": "bis 5,00 m"
  },
  ...
]
```

#### POST /api/bookings
Neue Buchung mit Kundendaten & Unterschrift erstellen
```json
Request Body:
{
  "locationId": 1,
  "vehicleTypeId": 1,
  "category": "outside",
  "firstName": "Max",
  "lastName": "Mustermann",
  "address": "Musterstraße 1, 14467 Potsdam",
  "email": "max@example.com",
  "startDate": "2025-11-01",
  "endDate": "2025-12-01",
  "monthlyPrice": 50,
  "caution": 50,
  "customerSignatureImage": "data:image/png;base64,iVBORw0KGgo..."
}

Response 201:
{
  "success": true,
  "bookingId": 42,
  "status": "pending_owner_signature",
  "message": "Buchung gespeichert. Bitte warten Sie auf die Bestätigung des Vermieters."
}

Response 400:
{
  "success": false,
  "error": "Validierungsfehler"
}
```

#### GET /api/bookings/:bookingId
Booking-Details mit allen Infos (für PDF-Generation)
```json
Response 200:
{
  "id": 42,
  "location_id": 1,
  "location_name": "Potsdam",
  "company": "Firma A GmbH",
  "city": "Potsdam",
  "vehicle_type_id": 1,
  "vehicle_label": "bis 5,00 m",
  "category": "outside",
  "first_name": "Max",
  "last_name": "Mustermann",
  "address": "Musterstraße 1, 14467 Potsdam",
  "email": "max@example.com",
  "start_date": "2025-11-01",
  "end_date": "2025-12-01",
  "monthly_price": 50,
  "caution": 50,
  "status": "pending_owner_signature",
  "customer_signature_date": "2025-10-22T14:30:00",
  "created_at": "2025-10-22T14:25:00"
}
```

#### POST /api/bookings/:bookingId/sign-customer
Kunden-Unterschrift speichern (wird auf booking.html gemacht)
```json
Request Body:
{
  "signatureImage": "data:image/png;base64,..."
}

Response 200:
{
  "success": true,
  "message": "Unterschrift gespeichert."
}
```

#### GET /api/contract/:bookingId
PDF-Vertrag herunterladen (generiert dynamisch)
```
Response 200: application/pdf
(vollständiger Vertrag als PDF mit Unterschrift-Feldern)
```

### Admin Endpoints (alle mit Bearer Token Authorization)

#### GET /api/admin/dashboard
Dashboard-Stats für Admin-Panel
```json
Headers: Authorization: Bearer YOUR_TOKEN

Response 200:
{
  "stats": {
    "totalBookings": 45,
    "pendingCustomerSignature": 5,
    "pendingOwnerSignature": 8,
    "completed": 32,
    "cancelled": 0
  },
  "recentBookings": [
    { "id": 45, "first_name": "Max", "last_name": "Mustermann", "location_name": "Potsdam", "status": "pending_owner_signature", "created_at": "2025-10-22T14:25:00" },
    ...
  ]
}
```

#### GET /api/admin/bookings
Alle Bookings mit Filter-Möglichkeit
```json
Headers: Authorization: Bearer YOUR_TOKEN

Query Params:
?status=pending_owner_signature
?location=1
?month=2025-11

Response 200:
[
  {
    "id": 42,
    "first_name": "Max",
    "last_name": "Mustermann",
    "email": "max@example.com",
    "location_name": "Potsdam",
    "vehicle_length": 5.0,
    "category": "outside",
    "monthly_price": 50,
    "start_date": "2025-11-01",
    "end_date": "2025-12-01",
    "status": "pending_owner_signature",
    "customer_signature_date": "2025-10-22T14:30:00",
    "created_at": "2025-10-22T14:25:00"
  },
  ...
]
```

#### POST /api/admin/bookings/:bookingId/sign-owner
Vermieter-Unterschrift speichern
```json
Headers: Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

Request Body:
{
  "signatureImage": "data:image/png;base64,..."
}

Response 200:
{
  "success": true,
  "message": "Vertrag unterzeichnet und abgeschlossen!",
  "status": "completed"
}
```

#### POST /api/admin/bookings/:bookingId/cancel
Buchung stornieren
```json
Headers: Authorization: Bearer YOUR_TOKEN

Request Body:
{
  "reason": "Kunde hat storniert"
}

Response 200:
{
  "success": true,
  "status": "cancelled"
}
```

---

## 🎨 Frontend Spezifikation

### booking.html - Kundenformular

**Flow:**
1. Load Locations from API
2. User wählt Location (mit ?location=X pre-select)
3. Load Pricing für Location
4. User wählt Fahzeugtyp → Kategorie → Mietdauer
5. System berechnet Preis live (mit MwSt)
6. User füllt Kundendaten
7. User unterschreibt mit Canvas-Signatur
8. Click "Abschicken" → POST /api/bookings
9. Success Message mit Booking-ID

**Elemente:**
- Responsive Mobile-first Design
- Modern CSS (Gradient, Shadows)
- Error Handling & Validierung
- Live Preisberechnung mit MwSt-Anzeige
- Canvas Signatur-Pad mit Touch-Support
- Loading States
- Accessibility (aria-labels, semantisches HTML)

**Daten erfassen:**
- Location (Select, vorausgewählt via URL-Param)
- Fahrzeugtyp (Select, abhängig von Location)
- Kategorie (Select, hardcoded)
- Mietdauer (Date-Inputs: Start + Ende)
- Vorname (Text Input)
- Nachname (Text Input)
- Adresse (Text Input)
- Email (Email Input)
- Unterschrift (Canvas)

**Validierung:**
- Alle Felder erforderlich
- Email-Format
- Mietende > Mietbeginn
- Unterschrift nicht leer

### admin.html - Admin-Dashboard

**Features:**
1. Login mit Token (einfach, nur Passwort)
2. Dashboard mit Stats (4 Karten)
3. Buchungs-Tabelle mit Filterung & Sorting
4. Modal zum Ansehen eines Vertrags (PDF iframe)
5. Modal zum Unterschreiben (Signatur-Canvas)
6. Auto-Refresh alle 30 Sekunden
7. Export-Button (optional)

**Seiten:**
- **Login:** Token-Input, Button
- **Dashboard:** Stats + Recent Bookings
- **Bookings-Table:** Alle Bookings mit Status-Badges
  - Filter nach Status
  - Sortierung nach Datum
  - Inline Actions (View PDF, Sign)

**Modals:**
- Contract Viewer (PDF in iframe oder Base64 Viewer)
- Signature Modal (Canvas)

---

## 📄 PDF-Vertrag Spezifikation

Der Vertrag wird mit **pdfkit** generiert und enthält:

**Header:**
- Titel: "STELLPLATZ-MIETVERTRAG"
- Vermieter-Name & Standort
- Vertragsnummer (= Booking ID)
- Ausstellungsdatum

**Vermieter-Infos:**
- Firma
- Stadt/Adresse

**Mieter-Infos:**
- Vorname + Nachname
- Adresse
- Email

**Vermietete Sache:**
- Fahrzeugtyp (Wohnmobil/Boot + Größe)
- Kategorie (Außen/Überdacht/Halle)
- Standort

**Mietbedingungen:**
- Mietdauer (Von - Bis mit Datumsformat)
- Monatliche Miete (€ X,XX zzgl. 19% MwSt.)
- Gesamte Miete (€ X,XX incl. MwSt)
- Kaution (€ = 1 Monatsmiete)

**Leistungen:**
- ✓ Stellplatz (nur Abstellen)
- ✗ Stromanschluss: nicht vorhanden
- ✗ Entsorgung: nicht möglich

**Allgemeine Bedingungen:**
1. Miete am 1. des Monats fällig
2. Kaution nach Mietende zurück
3. Stellplatz nur zum Abstellen
4. Fahrzeug auf Risiko des Mieters
5. Beschädigungen werden berechnet
6. Mietverhältnis endet automatisch

**Unterschriftsfelder:**
- Kunde (mit Datum)
- Vermieter (mit Datum)
- Platz für digitale Unterschriften (Base64 PNG eingebettet)

**Design:**
- A4-Format (210x297mm)
- Deutsche Sprache
- Professionelle Fonts (Helvetica)
- Klare Struktur mit Überschriften
- Seitennummern (bei mehrseitigen)

---

## ⚙️ Initialisierung & Deployment

### Datenbank-Initialisierung

Beim Start automatisch:
1. Fahrzeugtypen einfügen (8 Stück, falls nicht vorhanden)
2. Beispiel-Locations einfügen (falls leer)
3. Preismatrix für alle Kombinationen berechnen und speichern

```javascript
// Beispiel-Daten
locations: [
  { name: "Potsdam", company: "Firma A GmbH", city: "Potsdam" },
  { name: "Brandenburg", company: "Firma A GmbH", city: "Brandenburg" },
  { name: "Frankfurt/Oder", company: "Firma B GmbH", city: "Frankfurt/Oder" }
]

vehicle_types: [
  { max_length: 5.0, label: "bis 5,00 m" },
  ... // 8 total
]

// Preismatrix wird aus config.js berechnet
```

### Environment-Variablen
```
PORT=3000
ADMIN_TOKEN=your_secure_token_here
NODE_ENV=production
```

### Package.json Scripts
```json
{
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "init-db": "node -e \"require('./database.js')\""
  }
}
```

---

## 🔒 Sicherheit & Best Practices

### Input Validation
- Alle API Inputs validieren (Body, Params, Headers)
- Email-Format prüfen
- Dates validieren (start < end)
- Länge & Type prüfen

### Authentication
- Bearer Token in Authorization Header für Admin APIs
- Token wird in .env gespeichert
- Token-Check vor jedem Admin-Endpoint

### Data Protection
- SQLite Foreign Keys aktivieren
- Datenbank-Backup vor Deployments
- Keine sensitiven Daten in Logs
- HTTPS auf Production (über Reverse Proxy)

### Error Handling
- Try-Catch in allen Async-Funktionen
- Aussagekräftige Error Messages
- Status Codes korrekt setzen (200, 201, 400, 401, 404, 500)

### CORS
- Bei Production: CORS auf erlaubte Domains begrenzen
- Lokaler Zugriff: * erlaubt

---

## 📦 Dependencies

```json
{
  "dependencies": {
    "express": "^4.18.2",
    "body-parser": "^1.20.2",
    "better-sqlite3": "^9.0.0",
    "pdfkit": "^0.13.0"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  }
}
```

---

## 🚀 Deployment Checklist

- [ ] `npm install` Dependencies
- [ ] `.env` erstellen mit ADMIN_TOKEN
- [ ] `npm run init-db` Datenbank erstellen
- [ ] Lokales Testen (`npm start`)
- [ ] Locations in DB eintragen
- [ ] Server hochfahren
- [ ] Reverse Proxy (Nginx/Apache) konfigurieren
- [ ] SSL/HTTPS aktivieren
- [ ] Links zu Kunden verteilen
- [ ] Monitoring/Logging aufsetzen

---

## 📝 Zusätzliche Notizen

### Zukünftige Features (Optional)
- [ ] Email-Versand nach Booking (nodemailer)
- [ ] Zahlungsintegration (Stripe, PayPal)
- [ ] Verfügbarkeitsverwaltung
- [ ] Kundenportal
- [ ] SMS-Notifications
- [ ] QR-Codes für schnelle Unterschrift
- [ ] Mehrsprachigkeit
- [ ] API-Dokumentation (Swagger)

### Performance
- SQLite ist ausreichend für diesen Use-Case
- Bei 1000+ Bookings/Monat: zu PostgreSQL migrieren
- Indexes auf häufig genutzten Feldern vorhanden

### Skalierung
- Struktur erlaubt einfache Erweiterung
- Preisstruktur leicht anpassbar (config.js)
- Neue Locations einfach hinzufügbar
- Neue Fahrzeugtypen ohne Code-Änderung

---

**Bereit zum Bauen mit Claude Code! 🚀**

Sende diese Spezifikation an Claude Code und es wird alles vollständig implementieren.
