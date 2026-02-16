const crypto = require('crypto');

/**
 * Pricing Resolution Logic
 * Formula: (base_price + length_surcharge) * category_factor
 * - base_price: from settings table (default 100€ netto, for Halle up to 5m)
 * - length_surcharge: >5m → +10€ per 0.5m step
 * - category_factor: indoor=1.0, covered=0.75, outside=0.50
 */
const CATEGORY_FACTORS = { outside: 0.50, covered: 0.75, indoor: 1.0 };
const LENGTH_THRESHOLD = 5.0;
const LENGTH_STEP = 0.5;
const SURCHARGE_PER_STEP = 10;

const getBasePrice = (db) => {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'base_price'").get();
  return row ? parseFloat(row.value) : 100;
};

const calculateFormulaPrice = (basePrice, maxLength, category) => {
  let surcharge = 0;
  if (maxLength > LENGTH_THRESHOLD) {
    const steps = Math.ceil((maxLength - LENGTH_THRESHOLD) / LENGTH_STEP);
    surcharge = steps * SURCHARGE_PER_STEP;
  }
  const factor = CATEGORY_FACTORS[category] || 1.0;
  return Math.round((basePrice + surcharge) * factor * 100) / 100;
};

const resolvePrice = (db, locationId, vehicleTypeId, category, atDate) => {
  const vehId = parseInt(vehicleTypeId);
  const cat = String(category);

  // Get vehicle type max_length
  const vehicleType = db.prepare('SELECT max_length FROM vehicle_types WHERE id = ?').get(vehId);
  if (!vehicleType) {
    throw new Error('NO_PRICE_RULE');
  }

  const basePrice = getBasePrice(db);
  const price = calculateFormulaPrice(basePrice, vehicleType.max_length, cat);

  return {
    price,
    source: 'formula'
  };
};

/**
 * Calculate pro-rata amount for first month
 */
const calculateProRata = (monthlyPrice, startDate) => {
  const start = new Date(startDate);
  const year = start.getFullYear();
  const month = start.getMonth();

  // Get total days in the month
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Get day of month (1-indexed)
  const startDay = start.getDate();

  // If starting on the 1st, no pro-rata needed
  if (startDay === 1) {
    return null;
  }

  // Calculate remaining days including start date
  const remainingDays = daysInMonth - startDay + 1;

  // Pro-rata calculation
  const dailyRate = monthlyPrice / daysInMonth;
  const proRataAmount = dailyRate * remainingDays;

  return Math.round(proRataAmount * 100) / 100; // Round to 2 decimals
};

/**
 * Validate and apply discount code
 */
const applyDiscount = (db, code, amount, locationId, bookingDate) => {
  if (!code) {
    return { discountAmount: 0, isValid: false };
  }

  const discount = db.prepare(`
    SELECT *
    FROM discounts
    WHERE code = ?
      AND is_active = 1
      AND (valid_from IS NULL OR valid_from <= ?)
      AND (valid_to IS NULL OR valid_to >= ?)
      AND (location_id IS NULL OR location_id = ?)
      AND (usage_limit IS NULL OR usage_count < usage_limit)
  `).get(code.toUpperCase(), bookingDate, bookingDate, locationId);

  if (!discount) {
    return { discountAmount: 0, isValid: false, error: 'Invalid or expired discount code' };
  }

  let discountAmount = 0;
  if (discount.discount_type === 'percent') {
    discountAmount = amount * (discount.value / 100);
  } else if (discount.discount_type === 'amount') {
    discountAmount = Math.min(discount.value, amount);
  }

  discountAmount = Math.max(0, Math.round(discountAmount * 100) / 100);

  return {
    discountAmount,
    isValid: true,
    discountId: discount.id
  };
};

/**
 * Increment discount usage count
 */
const incrementDiscountUsage = (db, discountId) => {
  if (!discountId) return;

  db.prepare(`
    UPDATE discounts
    SET usage_count = usage_count + 1
    WHERE id = ?
  `).run(discountId);
};

/**
 * Check for blackout periods
 */
const checkBlackouts = (db, locationId, startDate, endDate) => {
  // Ensure dates are strings in YYYY-MM-DD format
  const start = startDate instanceof Date
    ? startDate.toISOString().split('T')[0]
    : (startDate || new Date().toISOString().split('T')[0]);

  const end = endDate instanceof Date
    ? endDate.toISOString().split('T')[0]
    : (endDate || new Date().toISOString().split('T')[0]);

  const blackouts = db.prepare(`
    SELECT *
    FROM location_blackouts
    WHERE location_id = ?
      AND NOT (end_date < ? OR start_date > ?)
  `).all(locationId, start, end);

  return blackouts;
};

/**
 * Calculate deposit (caution)
 */
const calculateDeposit = (monthlyPrice, multiplier = 1) => {
  return Math.round(monthlyPrice * multiplier * 100) / 100;
};

/**
 * Calculate VAT
 */
const calculateVAT = (netAmount, rate = 0.19) => {
  return Math.round(netAmount * rate * 100) / 100;
};

/**
 * Generate terms hash for contract integrity
 */
const generateTermsHash = (templateBody, version, companyId, locationId) => {
  const hashInput = `${templateBody}|${version}|${companyId}|${locationId}`;
  return crypto.createHash('sha256').update(hashInput).digest('hex');
};

/**
 * Get active contract template
 * Priority: Location-specific > Company-specific > Global
 */
const getActiveTemplate = (db, locationId, companyId) => {
  // Try location-specific first
  let template = db.prepare(`
    SELECT *
    FROM contract_templates
    WHERE scope_type = 'location'
      AND scope_id = ?
      AND is_active = 1
    ORDER BY version DESC
    LIMIT 1
  `).get(locationId);

  if (template) return template;

  // Try company-specific
  if (companyId) {
    template = db.prepare(`
      SELECT *
      FROM contract_templates
      WHERE scope_type = 'company'
        AND scope_id = ?
        AND is_active = 1
      ORDER BY version DESC
      LIMIT 1
    `).get(companyId);

    if (template) return template;
  }

  // Fallback to global
  template = db.prepare(`
    SELECT *
    FROM contract_templates
    WHERE scope_type = 'global'
      AND is_active = 1
    ORDER BY version DESC
    LIMIT 1
  `).get();

  return template;
};

/**
 * Render contract template with data
 */
const renderTemplate = (template, data) => {
  let rendered = template;

  // Simple template replacement (supports {{variable}} syntax)
  Object.keys(data).forEach(key => {
    const regex = new RegExp(`{{${key}}}`, 'g');
    rendered = rendered.replace(regex, data[key] || '');
  });

  // Handle conditionals {{#if variable}}...{{/if}}
  rendered = rendered.replace(/{{#if\s+(\w+)}}(.*?){{\/if}}/gs, (match, variable, content) => {
    return data[variable] ? content : '';
  });

  // Handle {{#unless variable}}...{{/unless}}
  rendered = rendered.replace(/{{#unless\s+(\w+)}}(.*?){{\/unless}}/gs, (match, variable, content) => {
    return !data[variable] ? content : '';
  });

  return rendered;
};

/**
 * Calculate total billing amount
 */
const calculateTotalBilling = (monthlyPrice, proRataAmount, discountAmount, depositAmount) => {
  const firstPayment = proRataAmount || monthlyPrice;
  const total = firstPayment - discountAmount + depositAmount;
  return Math.max(0, Math.round(total * 100) / 100);
};

/**
 * Validate signature quality
 */
const validateSignature = (signatureSVG) => {
  if (!signatureSVG) {
    return { valid: false, error: 'Signature is required' };
  }

  // Extract path data
  const pathMatches = signatureSVG.match(/<path d="([^"]+)"/g);

  if (!pathMatches || pathMatches.length === 0) {
    return { valid: false, error: 'Signature appears to be empty' };
  }

  // Count total commands (M and L commands)
  let totalCommands = 0;
  pathMatches.forEach(pathMatch => {
    const path = pathMatch.match(/d="([^"]+)"/)[1];
    const commands = path.split(/(?=[ML])/).length;
    totalCommands += commands;
  });

  // Minimum quality check: at least 10 commands (points/strokes)
  if (totalCommands < 10) {
    return { valid: false, error: 'Signature is too simple. Please sign with your full name.' };
  }

  // Extract bounding box (basic check)
  const coords = [];
  pathMatches.forEach(pathMatch => {
    const path = pathMatch.match(/d="([^"]+)"/)[1];
    const numbers = path.match(/[\d.]+/g);
    if (numbers) {
      for (let i = 0; i < numbers.length; i += 2) {
        coords.push({ x: parseFloat(numbers[i]), y: parseFloat(numbers[i + 1]) });
      }
    }
  });

  if (coords.length > 0) {
    const xs = coords.map(c => c.x);
    const ys = coords.map(c => c.y);
    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...ys) - Math.min(...ys);
    const area = width * height;

    // Minimum bounding box area check
    if (area < 1000) {
      return { valid: false, error: 'Signature is too small. Please sign larger.' };
    }
  }

  return { valid: true };
};

module.exports = {
  resolvePrice,
  getBasePrice,
  calculateFormulaPrice,
  CATEGORY_FACTORS,
  LENGTH_THRESHOLD,
  LENGTH_STEP,
  SURCHARGE_PER_STEP,
  calculateProRata,
  applyDiscount,
  incrementDiscountUsage,
  checkBlackouts,
  calculateDeposit,
  calculateVAT,
  generateTermsHash,
  getActiveTemplate,
  renderTemplate,
  calculateTotalBilling,
  validateSignature
};
