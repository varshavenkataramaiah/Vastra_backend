const mongoose = require('mongoose');

const savedProductSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    name: { type: String, default: 'Product' },
    image: { type: String, default: '' },
    price: { type: Number, default: 0 },
    rating: { type: Number, default: 5 },
    sale: { type: Boolean, default: true },
    quantity: { type: Number, min: 1, default: 1 },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true, unique: true, sparse: true },
    mobile: { type: String, trim: true, unique: true, sparse: true },
    password: { type: String, default: '' },
    gender: { type: String, default: '' },
    dateOfBirth: { type: String, default: '' },
    location: { type: String, default: '' },
    alternateMobile: { type: String, default: '' },
    hintName: { type: String, default: '' },
    cartItems: { type: [savedProductSchema], default: [] },
    wishlistItems: { type: [savedProductSchema], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
