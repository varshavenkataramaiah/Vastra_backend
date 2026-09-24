const test = require('node:test');
const assert = require('node:assert/strict');

test('user and product models are defined', () => {
  const User = require('../models/User');
  const Product = require('../models/Product');
  const Order = require('../models/Order');

  assert.equal(typeof User, 'function');
  assert.equal(typeof Product, 'function');
  assert.equal(User.modelName, 'User');
  assert.equal(Product.modelName, 'Product');
  assert.equal(Order.modelName, 'Order');
});
