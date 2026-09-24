const test = require('node:test');
const assert = require('node:assert/strict');

test('order model is defined', () => {
  const Order = require('../models/Order');

  assert.equal(typeof Order, 'function');
  assert.equal(Order.modelName, 'Order');
});