const test = require('node:test');
const assert = require('node:assert/strict');

const { generateToken, verifyToken } = require('../utils/jwt');

test('jwt helpers create and verify a valid token', () => {
  const payload = { id: '123', email: 'demo@example.com' };
  const token = generateToken(payload);

  assert.ok(token);
  assert.deepEqual(verifyToken(token).email, 'demo@example.com');
  assert.equal(verifyToken(token).id, '123');
});
