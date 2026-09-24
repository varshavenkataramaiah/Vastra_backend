const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'vastra-dev-secret';

const generateToken = (payload) => jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
const verifyToken = (token) => jwt.verify(token, JWT_SECRET);

module.exports = { generateToken, verifyToken };
