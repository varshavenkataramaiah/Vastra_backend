const authMiddleware = require('./authMiddleware');
const { isAdminEmail } = require('../utils/admin');

const adminMiddleware = (req, res, next) => {
  authMiddleware(req, res, () => {
    if (!isAdminEmail(req.user?.email)) {
      return res.status(403).json({ message: 'Admin access is required' });
    }

    next();
  });
};

module.exports = adminMiddleware;
