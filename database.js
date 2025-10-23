const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'stellplatz.db');
const db = new Database(dbPath);

// Foreign Keys aktivieren
db.pragma('foreign_keys = ON');

// Tabellen erstellen
db.exec(`
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

  CREATE TABLE IF NOT EXISTS vehicle_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    max_length REAL NOT NULL UNIQUE,
    label TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS pricing (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    location_id INTEGER NOT NULL,
    vehicle_type_id INTEGER NOT NULL,
    price_per_month REAL NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (location_id) REFERENCES locations(id),
    FOREIGN KEY (vehicle_type_id) REFERENCES vehicle_types(id),
    UNIQUE(location_id, vehicle_type_id)
  );

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
    monthly_price REAL NOT NULL,
    caution REAL NOT NULL,
    status TEXT DEFAULT 'pending_customer_signature',
    customer_signature_date DATETIME,
    owner_signature_date DATETIME,
    customer_signature_image TEXT,
    owner_signature_image TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (location_id) REFERENCES locations(id),
    FOREIGN KEY (vehicle_type_id) REFERENCES vehicle_types(id)
  );

  CREATE INDEX IF NOT EXISTS idx_bookings_location ON bookings(location_id);
  CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
  CREATE INDEX IF NOT EXISTS idx_locations_company ON locations(company_id);
`);

module.exports = db;
