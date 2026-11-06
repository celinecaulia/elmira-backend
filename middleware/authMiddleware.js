// backend/middleware/authMiddleware.js

const verifyOwnerRole = (req, res, next) => {
  const ownerAuthHeader = req.headers['x-owner-auth']; 
  const validSecretToken = process.env.OWNER_SECRET_TOKEN || 'KunciRahasiaOwnerElmira2026';

  if (!ownerAuthHeader || ownerAuthHeader !== validSecretToken) {
    return res.status(403).json({
      success: false,
      message: 'Akses Ditolak (403 Forbidden): Anda tidak memiliki hak akses tingkat Owner!'
    });
  }

  next();
};

// Middleware khusus verifikasi role Admin
const verifyAdminRole = (req, res, next) => {
  const adminToken = req.headers['x-admin-auth'];
  const validAdminToken = process.env.ADMIN_SECRET_TOKEN || 'KunciRahasiaAdminElmira2026';

  if (!adminToken || adminToken !== validAdminToken) {
    return res.status(403).json({
      success: false,
      message: "Akses Ditolak (403 Forbidden): Anda tidak memiliki hak akses tingkat Admin!"
    });
  }
  next();
};

module.exports = { verifyOwnerRole, verifyAdminRole };