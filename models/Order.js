const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema(
  {
    productId: { type: String, required: true },
    name: { type: String, required: true },
    image: { type: String, default: '' },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: true }
);

const orderSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    items: [orderItemSchema],
    total: { type: Number, required: true, min: 0 },
    status: { type: String, default: 'PLACED' },
    returnRequested: { type: Boolean, default: false },
    returnStatus: {
      type: String,
      enum: ['NONE', 'REQUESTED', 'ACCEPTED', 'RECEIVED', 'REJECTED'],
      default: 'NONE',
    },
    refundStatus: {
      type: String,
      enum: ['NOT_APPLICABLE', 'PENDING', 'INITIATED', 'FAILED'],
      default: 'NOT_APPLICABLE',
    },
    refundId: { type: String, default: '' },
    paymentMethod: { type: String, enum: ['cash', 'razorpay'], default: 'cash' },
    paymentStatus: { type: String, enum: ['pending', 'paid', 'refunded'], default: 'pending' },
    razorpayOrderId: { type: String, default: '' },
    razorpayPaymentId: { type: String, default: '' },
    shippingAddress: {
      fullName: { type: String, default: '' },
      email: { type: String, default: '' },
      mobile: { type: String, default: '' },
      address: { type: String, default: '' },
      city: { type: String, default: '' },
      state: { type: String, default: '' },
      zipCode: { type: String, default: '' },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Order', orderSchema);
