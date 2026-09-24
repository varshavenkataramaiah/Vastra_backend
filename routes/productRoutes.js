const express = require('express');
const Product = require('../models/Product');
const Order = require('../models/Order');
const seedProducts = require('../data/seedProducts');
const adminMiddleware = require('../middleware/adminMiddleware');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const filters = {};
    const search = String(req.query.search || '').trim();
    const category = String(req.query.category || '').trim();

    if (search) {
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filters.$or = [
        { name: { $regex: escapedSearch, $options: 'i' } },
        { description: { $regex: escapedSearch, $options: 'i' } },
      ];
    }

    if (category) {
      filters.category = category;
    }

    const products = await Product.find(filters).sort({ createdAt: -1 });
    res.status(200).json({ products });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch products', error: error.message });
  }
});

router.get('/seed', async (req, res) => {
  try {
    const existing = await Product.countDocuments();
    if (existing > 0) {
      await Product.updateMany(
        { stock: { $exists: false } },
        { $set: { stock: 10 } }
      );
      return res.status(200).json({ message: 'Seed data already exists', count: existing });
    }

    const products = await Product.insertMany(seedProducts);
    res.status(201).json({ message: 'Seed data inserted', count: products.length });
  } catch (error) {
    res.status(500).json({ message: 'Failed to seed products', error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    res.status(200).json({ product });
  } catch (error) {
    res.status(400).json({ message: 'Invalid product id' });
  }
});

router.post('/', adminMiddleware, async (req, res) => {
  try {
    const product = await Product.create(req.body);
    res.status(201).json({ message: 'Product created', product });
  } catch (error) {
    res.status(400).json({ message: 'Failed to create product', error: error.message });
  }
});

router.put('/:id', adminMiddleware, async (req, res) => {
  try {
    const allowedFields = ['name', 'category', 'price', 'rating', 'image', 'description', 'inStock', 'stock'];
    const updates = {};
    allowedFields.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, field)) {
        updates[field] = req.body[field];
      }
    });

    const product = await Product.findByIdAndUpdate(req.params.id, updates, {
      returnDocument: 'after',
      runValidators: true,
    });
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    res.status(200).json({ message: 'Product updated', product });
  } catch (error) {
    res.status(400).json({ message: 'Failed to update product', error: error.message });
  }
});

router.delete('/:id', adminMiddleware, async (req, res) => {
  try {
    const linkedOrder = await Order.exists({ 'items.productId': req.params.id });
    if (linkedOrder) {
      return res.status(409).json({ message: 'Product cannot be deleted because it is referenced by an order' });
    }

    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    res.status(200).json({ message: 'Product deleted', productId: product._id });
  } catch (error) {
    res.status(400).json({ message: 'Failed to delete product', error: error.message });
  }
});

module.exports = router;
