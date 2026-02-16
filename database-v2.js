const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

const dbPath = path.join(__dirname, 'stellplatz.db');
const db = new Database(dbPath);

// Enable WAL mode for better performance and concurrency
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create all tables
db.exec(`
  -- Companies (existing, no changes needed)
  CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    street TEXT NOT NULL,
    house_number TEXT NOT NULL,
    postal_code TEXT NOT NULL,
    city TEXT NOT NULL,
    tax_number TEXT,
    vat_id TEXT,
    bank_account TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Locations (existing, no changes needed)
  CREATE TABLE IF NOT EXISTS locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    building_specification TEXT,
    category TEXT NOT NULL CHECK(category IN ('outside', 'covered', 'indoor')),
    company_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL
  );

  -- Vehicle Types (existing, no changes needed)
  CREATE TABLE IF NOT EXISTS vehicle_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    max_length REAL NOT NULL UNIQUE,
    label TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- NEW: Contract Templates (versioned)
  CREATE TABLE IF NOT EXISTS contract_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    scope_type TEXT NOT NULL CHECK(scope_type IN ('global', 'company', 'location')),
    scope_id INTEGER,
    body_md TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    is_active INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- NEW: Pricing Rules (flexible, priority-based)
  CREATE TABLE IF NOT EXISTS pricing_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    location_id INTEGER NOT NULL,
    vehicle_type_id INTEGER NOT NULL,
    category TEXT NOT NULL CHECK(category IN ('outside', 'covered', 'indoor')),
    base_price REAL NOT NULL,
    valid_from DATE,
    valid_to DATE,
    priority INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE,
    FOREIGN KEY (vehicle_type_id) REFERENCES vehicle_types(id) ON DELETE CASCADE
  );

  -- NEW: Pricing Overrides (seasonal, fixed price)
  CREATE TABLE IF NOT EXISTS pricing_overrides (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    location_id INTEGER NOT NULL,
    vehicle_type_id INTEGER NOT NULL,
    category TEXT NOT NULL CHECK(category IN ('outside', 'covered', 'indoor')),
    override_price REAL NOT NULL,
    valid_from DATE NOT NULL,
    valid_to DATE NOT NULL,
    reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE,
    FOREIGN KEY (vehicle_type_id) REFERENCES vehicle_types(id) ON DELETE CASCADE
  );

  -- NEW: Discounts
  CREATE TABLE IF NOT EXISTS discounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    discount_type TEXT NOT NULL CHECK(discount_type IN ('percent', 'amount')),
    value REAL NOT NULL,
    valid_from DATE,
    valid_to DATE,
    location_id INTEGER,
    usage_limit INTEGER,
    usage_count INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE
  );

  -- NEW: Location Blackouts
  CREATE TABLE IF NOT EXISTS location_blackouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    location_id INTEGER NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE
  );

  -- NEW: Invite Tokens
  CREATE TABLE IF NOT EXISTS invite_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT NOT NULL UNIQUE,
    location_id INTEGER,
    vehicle_type_id INTEGER,
    category TEXT CHECK(category IN ('outside', 'covered', 'indoor')),
    prefill_email TEXT,
    expires_at DATETIME NOT NULL,
    used_at DATETIME,
    booking_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE,
    FOREIGN KEY (vehicle_type_id) REFERENCES vehicle_types(id) ON DELETE CASCADE,
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL
  );

  -- Bookings (enhanced with new fields)
  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    location_id INTEGER NOT NULL,
    vehicle_type_id INTEGER NOT NULL,
    category TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    address TEXT NOT NULL,
    email TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,

    -- Billing details
    monthly_price REAL NOT NULL,
    prorata_amount REAL,
    discount_code TEXT,
    discount_amount REAL DEFAULT 0,
    deposit_multiplier REAL NOT NULL DEFAULT 2,
    caution REAL NOT NULL,
    total_amount REAL NOT NULL,
    billing_cycle TEXT NOT NULL DEFAULT 'monthly',
    notice_period_days INTEGER NOT NULL DEFAULT 30,

    -- Contract & Template
    template_id INTEGER,
    template_version INTEGER,
    terms_hash TEXT,

    -- Status
    status TEXT DEFAULT 'pending_customer_signature',

    -- Signatures
    customer_signature_date DATETIME,
    customer_signature_image TEXT,
    customer_signature_svg TEXT,
    customer_signer_ip TEXT,
    customer_user_agent TEXT,

    owner_signature_date DATETIME,
    owner_signature_image TEXT,
    owner_signature_svg TEXT,
    owner_signer_ip TEXT,
    owner_user_agent TEXT,

    -- Metadata
    invite_token_id INTEGER,
    idempotency_key TEXT UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (location_id) REFERENCES locations(id),
    FOREIGN KEY (vehicle_type_id) REFERENCES vehicle_types(id),
    FOREIGN KEY (template_id) REFERENCES contract_templates(id),
    FOREIGN KEY (invite_token_id) REFERENCES invite_tokens(id)
  );

  -- NEW: Audit Log
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id INTEGER,
    metadata TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Settings (key-value store for global config)
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Indexes
  CREATE INDEX IF NOT EXISTS idx_bookings_location ON bookings(location_id);
  CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
  CREATE INDEX IF NOT EXISTS idx_bookings_dates ON bookings(start_date, end_date);
  CREATE INDEX IF NOT EXISTS idx_locations_company ON locations(company_id);
  CREATE INDEX IF NOT EXISTS idx_pricing_rules_location ON pricing_rules(location_id);
  CREATE INDEX IF NOT EXISTS idx_pricing_overrides_dates ON pricing_overrides(valid_from, valid_to);
  CREATE INDEX IF NOT EXISTS idx_blackouts_dates ON location_blackouts(location_id, start_date, end_date);
  CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
  CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);
  CREATE INDEX IF NOT EXISTS idx_invite_tokens_token ON invite_tokens(token);
  CREATE INDEX IF NOT EXISTS idx_contract_templates_active ON contract_templates(is_active, scope_type);
`);

// Migration: Check if we need to add new columns to existing bookings table
const checkAndMigrateBookings = () => {
  try {
    // Check if new columns exist
    const columns = db.prepare("PRAGMA table_info(bookings)").all();
    const columnNames = columns.map(c => c.name);

    const newColumns = [
      'prorata_amount REAL',
      'discount_code TEXT',
      'discount_amount REAL DEFAULT 0',
      'deposit_multiplier REAL NOT NULL DEFAULT 2',
      'total_amount REAL',
      'billing_cycle TEXT NOT NULL DEFAULT \'monthly\'',
      'notice_period_days INTEGER NOT NULL DEFAULT 30',
      'template_id INTEGER',
      'template_version INTEGER',
      'terms_hash TEXT',
      'customer_signer_ip TEXT',
      'customer_user_agent TEXT',
      'owner_signer_ip TEXT',
      'owner_user_agent TEXT',
      'invite_token_id INTEGER',
      'idempotency_key TEXT',
      'updated_at DATETIME DEFAULT CURRENT_TIMESTAMP'
    ];

    for (const col of newColumns) {
      const colName = col.split(' ')[0];
      if (!columnNames.includes(colName)) {
        try {
          db.prepare(`ALTER TABLE bookings ADD COLUMN ${col}`).run();
          console.log(`✓ Added column: ${colName}`);
        } catch (e) {
          if (!e.message.includes('duplicate column name')) {
            console.error(`Error adding column ${colName}:`, e.message);
          }
        }
      }
    }

    // Update total_amount for existing bookings if null
    db.prepare(`
      UPDATE bookings
      SET total_amount = monthly_price + caution
      WHERE total_amount IS NULL
    `).run();

    console.log('✓ Bookings table migration completed');
  } catch (error) {
    console.error('Migration error:', error);
  }
};

// Helper: Create default global contract template if none exists
const ensureDefaultTemplate = () => {
  const existing = db.prepare('SELECT COUNT(*) as count FROM contract_templates').get();
  if (existing.count === 0) {
    const defaultTemplate = `# Stellplatzmietvertrag (temporär)

## Vertragsparteien

**Vermieter:**
{{company_name}}
{{company_street}} {{company_house_number}}
{{company_postal_code}} {{company_city}}
E-Mail: {{company_email}}

**Mieter:**
{{customer_first_name}} {{customer_last_name}}
{{customer_address}}
E-Mail: {{customer_email}}

## §1 Mietgegenstand

(1) Vermietet wird ein Stellplatz am Standort {{location_address}}, {{category_label}} (nachfolgend „Stellplatz").

(2) Der Stellplatz dient ausschließlich zum Abstellen des folgenden Fahrzeugs/Bootes: {{vehicle_label}}.

## §2 Mietzeit / Kündigung

(1) Mietbeginn: {{start_date}}, Mietende: {{end_date}}

(2) Eine Untervermietung ist ausgeschlossen. Eine Wohnnutzung/Übernachtung ist untersagt.

(3) Nach Ablauf der in Abs. (1) vereinbarten Mietzeit verlängert sich das Mietverhältnis auf unbestimmte Zeit jeweils um einen Monat, sofern es nicht von einer der Vertragsparteien mit einer Frist von einem Monat zum Monatsende gekündigt wird.
Die Kündigung bedarf der Textform; die Übermittlung per E-Mail ist ausreichend.

## §3 Miete / Zahlung / Kaution

(1) Miete: € {{net_price}} monatlich (Netto) + € {{vat_amount}} (19% MwSt.) = € {{gross_price}} (Brutto).

{{#if prorata_amount}}
(2) Anteilige Miete für ersten Monat: € {{prorata_amount}} (Brutto).
{{/if}}

{{#if discount_amount}}
(3) Rabatt (Code: {{discount_code}}): -€ {{discount_amount}}
{{/if}}

(4) Fälligkeit: monatlich zum 1. des Monats (Vorkasse).

(5) Kaution: € {{caution}}, zahlbar vor Übergabe.

## §4 Nutzungsvorgaben / Hausordnung

(1) Verboten sind: Lagerung von Gefahrstoffen, Arbeiten mit offener Flamme, Flüssiggasbetrieb in geschlossenen Bereichen, umweltgefährdende Leckagen.

(2) Der Mieter hält den Stellplatz sauber und meldet Schäden unverzüglich.

## §5 Zugang / Schlüsseltresor

{{#if access_code}}
(1) Zugang erfolgt über Schlüsseltresor, Code: {{access_code}}. Der Code ist vertraulich zu behandeln.
{{/if}}
{{#unless access_code}}
(1) Zugang erfolgt über Schlüsseltresor, Code wird separat mitgeteilt. Der Code ist vertraulich zu behandeln.
{{/unless}}

(2) Verlust/Missbrauch führt zu Kostenersatz (Schließung/Neucodierung).

## §6 Haftung / Versicherung

(1) Keine Bewachung/Verwahrung. Der Vermieter schuldet keine Überwachung des Stellplatzes oder des abgestellten Fahrzeugs/Boots.

(2) Der Mieter ist verpflichtet, eine Haftpflichtversicherung zu unterhalten und auf Anforderung nachzuweisen.

(3) Der Vermieter haftet nur für Vorsatz und grobe Fahrlässigkeit; bei einfacher Fahrlässigkeit nur bei Verletzung wesentlicher Vertragspflichten und begrenzt auf den vertragstypischen, vorhersehbaren Schaden.

(4) Keine Haftung für Diebstahl, Vandalismus, Unwetter, Dritte.

## §7 Schäden / Instandsetzung

(1) Beschädigungen am Gelände, Toren, Gebäuden oder Einrichtungen sind vom Mieter zu ersetzen.

(2) Leckagen (Öl, Treibstoff etc.) sind sofort zu melden; Reinigungskosten trägt der Mieter.

## §8 Vertragsbeendigung / Räumung

(1) Mit Ende der Mietzeit ist der Stellplatz vollständig zu räumen und besenrein zu hinterlassen.

(2) Zurückgelassene Gegenstände können auf Kosten des Mieters entfernt werden.

## §9 Datenschutz

(1) Der Vermieter verarbeitet personenbezogene Daten zur Vertragsdurchführung (Art. 6 Abs. 1 lit. b DSGVO).

(2) Kamera-/Zutrittsprotokolle am Standort: Hinweis gemäß Aushang.

## §10 Schlussbestimmungen

(1) Änderungen/Ergänzungen bedürfen der Textform.

(2) Sollte eine Bestimmung unwirksam sein, bleibt der Vertrag im Übrigen wirksam.

(3) Gerichtsstand: Sitz des Vermieters, sofern gesetzlich zulässig.

## Widerruf / Verbraucherhinweis

Sofern ein gesetzliches Widerrufsrecht besteht, beträgt die Frist 14 Tage ab Vertragsschluss; Muster-Widerrufsbelehrung in der Anlage. Wenn der Mietbeginn vor Ablauf der Frist liegt und Sie möchten, dass wir direkt starten, bestätigen Sie bitte im Formular die Ausführung vor Fristende; Ihnen ist bekannt, dass das Widerrufsrecht dann – soweit gesetzlich vorgesehen – erlöschen kann.

---

**Ort/Datum:** {{contract_date}}

**Unterschriften**

Mieter: {{customer_signature}}
Vermieter: {{owner_signature}}
`;

    db.prepare(`
      INSERT INTO contract_templates (name, scope_type, scope_id, body_md, version, is_active)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('Standard Stellplatzmietvertrag', 'global', null, defaultTemplate, 1, 1);

    console.log('✓ Created default contract template');
  }
};

// Migration: Add access_code to locations table
const migrateLocationsAccessCode = () => {
  try {
    const columns = db.prepare("PRAGMA table_info(locations)").all();
    const columnNames = columns.map(c => c.name);
    if (!columnNames.includes('access_code')) {
      db.prepare('ALTER TABLE locations ADD COLUMN access_code TEXT').run();
      console.log('✓ Added column: access_code to locations');
    }
  } catch (error) {
    if (!error.message.includes('duplicate column name')) {
      console.error('Migration error (locations.access_code):', error.message);
    }
  }
};

// Migration: Add email to companies table
const migrateCompaniesEmail = () => {
  try {
    const columns = db.prepare("PRAGMA table_info(companies)").all();
    const columnNames = columns.map(c => c.name);
    if (!columnNames.includes('email')) {
      db.prepare('ALTER TABLE companies ADD COLUMN email TEXT').run();
      console.log('✓ Added column: email to companies');
    }
  } catch (error) {
    if (!error.message.includes('duplicate column name')) {
      console.error('Migration error (companies.email):', error.message);
    }
  }
};

// Ensure default base price setting exists
const ensureDefaultSettings = () => {
  const existing = db.prepare("SELECT key FROM settings WHERE key = 'base_price'").get();
  if (!existing) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('base_price', '100')").run();
    console.log('✓ Default base_price setting created (100€)');
  }
};

// Run migrations
checkAndMigrateBookings();
migrateLocationsAccessCode();
migrateCompaniesEmail();
ensureDefaultSettings();
ensureDefaultTemplate();

console.log('✓ Database v2 initialized with WAL mode');

module.exports = db;
