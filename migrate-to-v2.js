#!/usr/bin/env node

/**
 * Migration script from v1 to v2
 * This script migrates existing data and initializes new tables
 */

const fs = require('fs');
const path = require('path');

console.log('\n🚀 Starting migration to v2...\n');

// Backup existing database
const dbPath = path.join(__dirname, 'stellplatz.db');
const backupPath = path.join(__dirname, `stellplatz-backup-${Date.now()}.db`);

if (fs.existsSync(dbPath)) {
    console.log('📦 Creating backup...');
    fs.copyFileSync(dbPath, backupPath);
    console.log(`✓ Backup created: ${backupPath}\n`);
}

// Load the new database module (which runs migrations)
console.log('🔧 Running database migrations...');
const db = require('./database-v2');

// Initialize pricing rules from existing pricing table
console.log('\n📊 Migrating pricing data to new system...');

try {
    // Check if old pricing table has data
    const oldPricing = db.prepare('SELECT COUNT(*) as count FROM pricing').get();

    if (oldPricing.count > 0) {
        console.log(`Found ${oldPricing.count} pricing entries to migrate`);

        // Get all pricing entries
        const entries = db.prepare(`
            SELECT DISTINCT
                p.location_id,
                p.vehicle_type_id,
                p.price_per_month
            FROM pricing p
        `).all();

        // Categories and multipliers
        const categories = ['outside', 'covered', 'indoor'];
        const multipliers = { outside: 0.50, covered: 0.75, indoor: 1.0 };

        let migratedCount = 0;

        entries.forEach(entry => {
            categories.forEach(category => {
                const basePrice = entry.price_per_month;
                const adjustedPrice = basePrice * multipliers[category];

                try {
                    db.prepare(`
                        INSERT INTO pricing_rules (location_id, vehicle_type_id, category, base_price, priority)
                        VALUES (?, ?, ?, ?, 0)
                    `).run(entry.location_id, entry.vehicle_type_id, category, adjustedPrice);

                    migratedCount++;
                } catch (e) {
                    // Skip if already exists
                    if (!e.message.includes('UNIQUE')) {
                        console.error(`Error migrating pricing: ${e.message}`);
                    }
                }
            });
        });

        console.log(`✓ Migrated ${migratedCount} pricing rules\n`);
    } else {
        console.log('No old pricing data to migrate\n');
    }
} catch (error) {
    console.error('Error migrating pricing:', error.message);
}

// Create sample discount codes
console.log('🎫 Creating sample discount codes...');

const sampleDiscounts = [
    { code: 'WELCOME10', type: 'percent', value: 10, reason: 'Welcome discount' },
    { code: 'SUMMER25', type: 'amount', value: 25, reason: 'Summer promotion' },
    { code: 'EARLY50', type: 'amount', value: 50, reason: 'Early bird special' }
];

sampleDiscounts.forEach(discount => {
    try {
        db.prepare(`
            INSERT INTO discounts (code, discount_type, value, is_active)
            VALUES (?, ?, ?, 1)
        `).run(discount.code, discount.type, discount.value);
        console.log(`✓ Created discount: ${discount.code}`);
    } catch (e) {
        if (!e.message.includes('UNIQUE')) {
            console.error(`Error creating discount ${discount.code}:`, e.message);
        }
    }
});

console.log('');

// Check if default template exists
console.log('📄 Checking contract templates...');
const templateCount = db.prepare('SELECT COUNT(*) as count FROM contract_templates').get();
console.log(`✓ Found ${templateCount.count} contract template(s)\n`);

// Summary
console.log('📈 Migration Summary:');
console.log('─────────────────────────────────────');

const stats = {
    companies: db.prepare('SELECT COUNT(*) as count FROM companies').get().count,
    locations: db.prepare('SELECT COUNT(*) as count FROM locations').get().count,
    vehicleTypes: db.prepare('SELECT COUNT(*) as count FROM vehicle_types').get().count,
    pricingRules: db.prepare('SELECT COUNT(*) as count FROM pricing_rules').get().count,
    bookings: db.prepare('SELECT COUNT(*) as count FROM bookings').get().count,
    templates: db.prepare('SELECT COUNT(*) as count FROM contract_templates').get().count,
    discounts: db.prepare('SELECT COUNT(*) as count FROM discounts').get().count
};

console.log(`Companies:      ${stats.companies}`);
console.log(`Locations:      ${stats.locations}`);
console.log(`Vehicle Types:  ${stats.vehicleTypes}`);
console.log(`Pricing Rules:  ${stats.pricingRules}`);
console.log(`Bookings:       ${stats.bookings}`);
console.log(`Templates:      ${stats.templates}`);
console.log(`Discounts:      ${stats.discounts}`);
console.log('─────────────────────────────────────\n');

console.log('✅ Migration completed successfully!\n');
console.log('📝 Next steps:');
console.log('   1. Review the new database structure');
console.log('   2. Test the new v2 server: node server-v2.js');
console.log('   3. Access the new booking form: /booking-v2.html');
console.log('   4. If everything works, replace server.js with server-v2.js\n');

process.exit(0);
