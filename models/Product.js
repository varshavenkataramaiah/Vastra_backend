const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    image: { type: String, default: '' },
    description: { type: String, default: '' },
    inStock: { type: Boolean, default: true },
    stock: { type: Number, default: 10, min: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Product', productSchema);
