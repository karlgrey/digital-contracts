const { body, param, query, validationResult } = require('express-validator');

// Validation error handler middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array().map(err => ({
        field: err.path,
        message: err.msg,
        value: err.value
      }))
    });
  }
  next();
};

// Common validators
const validators = {
  // Booking validation
  createBooking: [
    body('locationId').isInt({ min: 1 }).withMessage('Valid location ID required'),
    body('vehicleTypeId').isInt({ min: 1 }).withMessage('Valid vehicle type ID required'),
    body('firstName').trim().isLength({ min: 2, max: 100 }).withMessage('First name must be 2-100 characters'),
    body('lastName').trim().isLength({ min: 2, max: 100 }).withMessage('Last name must be 2-100 characters'),
    body('address').trim().isLength({ min: 5, max: 500 }).withMessage('Address must be 5-500 characters'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('startDate').isISO8601().toDate().withMessage('Valid start date required'),
    body('endDate').isISO8601().toDate().withMessage('Valid end date required'),
    body('category').isIn(['outside', 'covered', 'indoor']).withMessage('Category must be outside, covered, or indoor'),
    body('customerSignatureImage').optional().isString(),
    body('customerSignatureSVG').optional().isString(),
    body('discountCode').optional().trim().isLength({ max: 50 }),
    body('depositMultiplier').optional().isFloat({ min: 0, max: 10 }).withMessage('Deposit multiplier must be 0-10'),
    body('billingCycle').optional().isIn(['monthly', 'quarterly', 'annual']).withMessage('Invalid billing cycle'),
    body('noticePeriodDays').optional().isInt({ min: 0, max: 365 }).withMessage('Notice period must be 0-365 days'),
    handleValidationErrors
  ],

  // Company validation
  createCompany: [
    body('name').trim().isLength({ min: 2, max: 200 }).withMessage('Company name must be 2-200 characters'),
    body('street').trim().isLength({ min: 2, max: 200 }).withMessage('Street must be 2-200 characters'),
    body('house_number').trim().isLength({ min: 1, max: 20 }).withMessage('House number must be 1-20 characters'),
    body('postal_code').trim().isLength({ min: 4, max: 10 }).withMessage('Postal code must be 4-10 characters'),
    body('city').trim().isLength({ min: 2, max: 100 }).withMessage('City must be 2-100 characters'),
    body('tax_number').optional().trim().isLength({ max: 50 }),
    body('vat_id').optional().trim().isLength({ max: 50 }),
    body('bank_account').optional().trim().isLength({ max: 500 }),
    handleValidationErrors
  ],

  // Location validation
  createLocation: [
    body('name').trim().isLength({ min: 2, max: 200 }).withMessage('Location name must be 2-200 characters'),
    body('address').trim().isLength({ min: 5, max: 500 }).withMessage('Address must be 5-500 characters'),
    body('building_specification').optional().trim().isLength({ max: 500 }),
    body('category').isIn(['outside', 'covered', 'indoor']).withMessage('Category must be outside, covered, or indoor'),
    body('company_id').optional().isInt({ min: 1 }).withMessage('Valid company ID required'),
    handleValidationErrors
  ],

  // Pricing Rule validation
  createPricingRule: [
    body('location_id').isInt({ min: 1 }).withMessage('Valid location ID required'),
    body('vehicle_type_id').isInt({ min: 1 }).withMessage('Valid vehicle type ID required'),
    body('category').isIn(['outside', 'covered', 'indoor']).withMessage('Category must be outside, covered, or indoor'),
    body('base_price').isFloat({ min: 0 }).withMessage('Base price must be positive'),
    body('valid_from').optional().isISO8601().toDate(),
    body('valid_to').optional().isISO8601().toDate(),
    body('priority').optional().isInt({ min: 0, max: 100 }).withMessage('Priority must be 0-100'),
    handleValidationErrors
  ],

  // Pricing Override validation
  createPricingOverride: [
    body('location_id').isInt({ min: 1 }).withMessage('Valid location ID required'),
    body('vehicle_type_id').isInt({ min: 1 }).withMessage('Valid vehicle type ID required'),
    body('category').isIn(['outside', 'covered', 'indoor']).withMessage('Category must be outside, covered, or indoor'),
    body('override_price').isFloat({ min: 0 }).withMessage('Override price must be positive'),
    body('valid_from').isISO8601().toDate().withMessage('Valid from date required'),
    body('valid_to').isISO8601().toDate().withMessage('Valid to date required'),
    body('reason').optional().trim().isLength({ max: 500 }),
    handleValidationErrors
  ],

  // Discount validation
  createDiscount: [
    body('code').trim().isLength({ min: 2, max: 50 }).isAlphanumeric().withMessage('Code must be 2-50 alphanumeric characters'),
    body('discount_type').isIn(['percent', 'amount']).withMessage('Type must be percent or amount'),
    body('value').isFloat({ min: 0 }).withMessage('Value must be positive'),
    body('valid_from').optional().isISO8601().toDate(),
    body('valid_to').optional().isISO8601().toDate(),
    body('location_id').optional().isInt({ min: 1 }),
    body('usage_limit').optional().isInt({ min: 1 }),
    handleValidationErrors
  ],

  // Blackout validation
  createBlackout: [
    body('location_id').isInt({ min: 1 }).withMessage('Valid location ID required'),
    body('start_date').isISO8601().toDate().withMessage('Valid start date required'),
    body('end_date').isISO8601().toDate().withMessage('Valid end date required'),
    body('reason').optional().trim().isLength({ max: 500 }),
    handleValidationErrors
  ],

  // Contract Template validation
  createTemplate: [
    body('name').trim().isLength({ min: 2, max: 200 }).withMessage('Template name must be 2-200 characters'),
    body('scope_type').isIn(['global', 'company', 'location']).withMessage('Scope type must be global, company, or location'),
    body('scope_id').optional().isInt({ min: 1 }),
    body('body_md').isLength({ min: 10 }).withMessage('Template body must be at least 10 characters'),
    handleValidationErrors
  ],

  // Invite Token validation
  createInviteToken: [
    body('location_id').optional().isInt({ min: 1 }),
    body('vehicle_type_id').optional().isInt({ min: 1 }),
    body('category').optional().isIn(['outside', 'covered', 'indoor']),
    body('prefill_email').optional().isEmail().normalizeEmail(),
    body('expires_in_hours').optional().isInt({ min: 1, max: 8760 }).withMessage('Expiry must be 1-8760 hours'),
    handleValidationErrors
  ],

  // Signature validation
  signOwner: [
    body('signatureImage').isString().withMessage('Signature image required'),
    body('signatureSVG').isString().withMessage('Signature SVG required'),
    handleValidationErrors
  ],

  // Query parameter validators
  bookingFilters: [
    query('status').optional().isIn(['pending_customer_signature', 'pending_owner_signature', 'completed']),
    query('location_id').optional().isInt({ min: 1 }),
    query('from').optional().isISO8601().toDate(),
    query('to').optional().isISO8601().toDate(),
    handleValidationErrors
  ],

  // Param validators
  idParam: [
    param('id').isInt({ min: 1 }).withMessage('Valid ID required'),
    handleValidationErrors
  ],

  bookingIdParam: [
    param('bookingId').isInt({ min: 1 }).withMessage('Valid booking ID required'),
    handleValidationErrors
  ],

  locationIdParam: [
    param('locationId').isInt({ min: 1 }).withMessage('Valid location ID required'),
    handleValidationErrors
  ]
};

module.exports = validators;
