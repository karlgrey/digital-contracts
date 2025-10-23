const db = require('./database');
const config = require('./config');

console.log('Seeding database...');

try {
  // 1. Insert Companies
  console.log('Inserting companies...');
  const company1 = db.prepare(`
    INSERT INTO companies (name, street, house_number, postal_code, city, tax_number, vat_id, bank_account)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'Firma A GmbH',
    'Musterstraße',
    '123',
    '14770',
    'Brandenburg an der Havel',
    '12/345/67890',
    'DE123456789',
    'IBAN: DE12 3456 7890 1234 5678 90\nBIC: BELADEBEXXX'
  );

  const company2 = db.prepare(`
    INSERT INTO companies (name, street, house_number, postal_code, city, tax_number, vat_id, bank_account)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'Firma B GmbH',
    'Hauptstraße',
    '456',
    '14473',
    'Potsdam',
    '12/987/65432',
    'DE987654321',
    'IBAN: DE98 7654 3210 9876 5432 10\nBIC: BELADEBEXXX'
  );

  console.log(`✓ Inserted ${company1.lastInsertRowid} and ${company2.lastInsertRowid}`);

  // 2. Insert Locations
  console.log('Inserting locations...');
  const loc1 = db.prepare(`
    INSERT INTO locations (name, address, building_specification, category, company_id)
    VALUES (?, ?, ?, ?, ?)
  `).run('Brandenburg Stellplatz A', 'An der Havel 10, 14770 Brandenburg', 'Außenbereich Nord', 'outside', company1.lastInsertRowid);

  const loc2 = db.prepare(`
    INSERT INTO locations (name, address, building_specification, category, company_id)
    VALUES (?, ?, ?, ?, ?)
  `).run('Brandenburg Stellplatz B', 'An der Havel 10, 14770 Brandenburg', 'Halle 1', 'indoor', company1.lastInsertRowid);

  const loc3 = db.prepare(`
    INSERT INTO locations (name, address, building_specification, category, company_id)
    VALUES (?, ?, ?, ?, ?)
  `).run('Potsdam Bootslager', 'Am Templiner See 5, 14473 Potsdam', 'Überdachter Bereich', 'covered', company2.lastInsertRowid);

  console.log(`✓ Inserted 3 locations`);

  // 3. Insert Vehicle Types
  console.log('Inserting vehicle types...');
  config.VEHICLE_TYPES.forEach(vt => {
    const exists = db.prepare('SELECT id FROM vehicle_types WHERE max_length = ?').get(vt.max_length);
    if (!exists) {
      db.prepare('INSERT INTO vehicle_types (max_length, label) VALUES (?, ?)').run(vt.max_length, vt.label);
    }
  });
  console.log(`✓ Inserted ${config.VEHICLE_TYPES.length} vehicle types`);

  // 4. Insert Pricing for all combinations
  console.log('Inserting pricing data...');
  const locations = db.prepare('SELECT id, category FROM locations').all();
  const vehicleTypes = db.prepare('SELECT id, max_length FROM vehicle_types').all();

  let pricingCount = 0;
  locations.forEach(location => {
    vehicleTypes.forEach(vt => {
      const basePrice = config.BASE_PRICES[vt.max_length] || 100;
      const multiplier = config.CATEGORY_MULTIPLIERS[location.category] || 1.0;
      const price = basePrice * multiplier;

      db.prepare(`
        INSERT INTO pricing (location_id, vehicle_type_id, price_per_month)
        VALUES (?, ?, ?)
      `).run(location.id, vt.id, price);
      pricingCount++;
    });
  });

  console.log(`✓ Inserted ${pricingCount} pricing entries`);
  console.log('\n✅ Database seeding completed successfully!');
  console.log(`   Companies: 2`);
  console.log(`   Locations: 3`);
  console.log(`   Vehicle Types: ${vehicleTypes.length}`);
  console.log(`   Pricing Entries: ${pricingCount}`);

} catch (error) {
  console.error('❌ Seeding failed:', error.message);
  process.exit(1);
}

db.close();
