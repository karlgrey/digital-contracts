const db = require('./database');

console.log('Adding SVG signature columns to bookings table...');

try {
  // Add SVG signature columns
  db.exec(`
    ALTER TABLE bookings ADD COLUMN customer_signature_svg TEXT;
  `);
  console.log('✓ Added customer_signature_svg column');

  db.exec(`
    ALTER TABLE bookings ADD COLUMN owner_signature_svg TEXT;
  `);
  console.log('✓ Added owner_signature_svg column');

  console.log('✅ Migration completed successfully!');
} catch (error) {
  if (error.message.includes('duplicate column name')) {
    console.log('⚠️  Columns already exist, skipping migration');
  } else {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

db.close();
