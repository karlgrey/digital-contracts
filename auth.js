const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'admin123';
const JWT_EXPIRY = '2h';

// Generate JWT token
const generateToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
};

// Verify JWT token
const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
};

// Middleware: JWT Authentication
const requireAuth = (req, res, next) => {
  // Check for JWT in httpOnly cookie first
  let token = req.cookies?.auth_token;

  // Fallback to Authorization header (for backwards compatibility)
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const bearerToken = authHeader.substring(7);
      // Check if it's the admin token (legacy)
      if (bearerToken === ADMIN_TOKEN) {
        req.user = { role: 'admin', legacy: true };
        return next();
      }
      token = bearerToken;
    }
  }

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized - No token provided' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Unauthorized - Invalid token' });
  }

  req.user = decoded;
  next();
};

// Admin login handler
const loginHandler = (req, res, db) => {
  const { token } = req.body;

  if (token !== ADMIN_TOKEN) {
    // Log failed attempt
    logAudit(db, 'system', 'login_failed', 'admin', null, { ip: req.ip }, req.ip, req.get('user-agent'));
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Generate JWT
  const jwtToken = generateToken({ role: 'admin', timestamp: Date.now() });

  // Set httpOnly cookie
  res.cookie('auth_token', jwtToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 2 * 60 * 60 * 1000 // 2 hours
  });

  // Log successful login
  logAudit(db, 'admin', 'login_success', 'admin', null, null, req.ip, req.get('user-agent'));

  res.json({ success: true, message: 'Logged in successfully' });
};

// Admin logout handler
const logoutHandler = (req, res, db) => {
  // Clear cookie
  res.clearCookie('auth_token');

  // Log logout
  logAudit(db, req.user?.role || 'admin', 'logout', 'admin', null, null, req.ip, req.get('user-agent'));

  res.json({ success: true, message: 'Logged out successfully' });
};

// Audit logging helper
const logAudit = (db, actor, action, entityType, entityId, metadata, ipAddress, userAgent) => {
  try {
    db.prepare(`
      INSERT INTO audit_log (actor, action, entity_type, entity_id, metadata, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      actor,
      action,
      entityType,
      entityId || null,
      metadata ? JSON.stringify(metadata) : null,
      ipAddress || null,
      userAgent || null
    );
  } catch (error) {
    console.error('Audit log error:', error);
  }
};

module.exports = {
  generateToken,
  verifyToken,
  requireAuth,
  loginHandler,
  logoutHandler,
  logAudit
};
