const express = require('express');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');
const crypto = require('crypto');
const Razorpay = require('razorpay');

const router = express.Router();

const getRazorpayClient = () => {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    return null;
  }
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
};

router.get('/', authMiddleware, async (req, res) => {
  try {
    await Order.updateMany(
      { userId: req.user.id, status: 'DELIVERED', returnStatus: { $in: ['ACCEPTED', 'RECEIVED'] } },
      { $set: { status: 'RETURNED' } }
    );
    const orders = await Order.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.status(200).json({ orders });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch orders', error: error.message });
  }
});

router.get('/admin/all', adminMiddleware, async (req, res) => {
  try {
    await Order.updateMany(
      { status: 'DELIVERED', returnStatus: { $in: ['ACCEPTED', 'RECEIVED'] } },
      { $set: { status: 'RETURNED' } }
    );
    const orders = await Order.find({}).sort({ createdAt: -1 });
    res.status(200).json({ orders });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch all orders', error: error.message });
  }
});

const restoreOrderStock = async (order) => {
  const orderProductIds = order.items.map((item) => String(item.productId));
  const existingProducts = await Product.find({ _id: { $in: orderProductIds } }).select('_id');
  const existingProductIds = new Set(existingProducts.map((product) => String(product._id)));
  if (orderProductIds.some((productId) => !existingProductIds.has(productId))) {
    return false;
  }

  const restockResults = await Promise.all(order.items.map((item) =>
    Product.updateOne(
      { _id: item.productId },
      { $inc: { stock: item.quantity }, $set: { inStock: true } }
    )
  ));
  return restockResults.every((result) => result.matchedCount === 1);
};

router.patch('/:id/cancel', authMiddleware, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid order id' });
    }

    const order = await Order.findOne({ _id: req.params.id, userId: req.user.id });
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (!['PLACED', 'PROCESSING'].includes(order.status)) {
      return res.status(409).json({ message: 'This order can no longer be cancelled' });
    }
    if (!(await restoreOrderStock(order))) {
      return res.status(409).json({ message: 'Unable to restore all product stock' });
    }

    order.status = 'CANCELLED';
    await order.save();
    res.status(200).json({ message: 'Order cancelled', order });
  } catch (error) {
    res.status(400).json({ message: 'Failed to cancel order', error: error.message });
  }
});

router.patch('/:id/return', authMiddleware, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid order id' });
    }

    const order = await Order.findOne({ _id: req.params.id, userId: req.user.id });
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.status !== 'DELIVERED' || order.returnStatus !== 'NONE') {
      return res.status(409).json({ message: 'This order is not eligible for a return request' });
    }

    order.returnRequested = true;
    order.returnStatus = 'REQUESTED';
    order.refundStatus = order.paymentMethod === 'cash' ? 'PENDING' : 'NOT_APPLICABLE';
    await order.save();
    res.status(200).json({ message: 'Return request submitted', order });
  } catch (error) {
    res.status(400).json({ message: 'Failed to request return', error: error.message });
  }
});

router.patch('/admin/:id/return', adminMiddleware, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid order id' });
    }

    const requestedStatus = String(req.body?.status || '').toUpperCase();
    if (!['ACCEPTED', 'RECEIVED', 'REJECTED'].includes(requestedStatus)) {
      return res.status(400).json({ message: 'Invalid return status' });
    }

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.returnStatus === 'NONE') {
      return res.status(409).json({ message: 'No return has been requested for this order' });
    }
    if (requestedStatus === 'ACCEPTED' && order.returnStatus !== 'REQUESTED') {
      return res.status(409).json({ message: 'Only requested returns can be accepted' });
    }
    if (requestedStatus === 'RECEIVED' && order.returnStatus !== 'ACCEPTED') {
      return res.status(409).json({ message: 'Accept the return before marking it received' });
    }
    if (requestedStatus === 'REJECTED' && order.returnStatus !== 'REQUESTED') {
      return res.status(409).json({ message: 'Only requested returns can be rejected' });
    }

    if (requestedStatus === 'RECEIVED') {
      if (order.paymentMethod === 'razorpay') {
        const razorpay = getRazorpayClient();
        if (!razorpay || !order.razorpayPaymentId) {
          order.refundStatus = 'FAILED';
          await order.save();
          return res.status(503).json({ message: 'Razorpay refund cannot be initiated without payment configuration' });
        }

        try {
          const refund = await razorpay.payments.refund(order.razorpayPaymentId, {
            amount: Math.round(order.total * 100),
            notes: { orderId: String(order._id) },
          });
          order.refundId = refund.id || '';
          order.refundStatus = 'INITIATED';
          order.paymentStatus = 'refunded';
        } catch (refundError) {
          order.refundStatus = 'FAILED';
          await order.save();
          return res.status(502).json({ message: 'Return received but refund could not be initiated', error: refundError.message });
        }
      } else {
        order.refundStatus = 'PENDING';
      }

      if (!(await restoreOrderStock(order))) {
        return res.status(409).json({ message: 'Return accepted but unable to restore all product stock' });
      }
    }

    order.returnStatus = requestedStatus;
    if (['ACCEPTED', 'RECEIVED'].includes(requestedStatus)) {
      order.status = 'RETURNED';
    }
    await order.save();
    res.status(200).json({ message: `Return marked ${requestedStatus.toLowerCase()}`, order });
  } catch (error) {
    res.status(400).json({ message: 'Failed to update return', error: error.message });
  }
});

router.patch('/admin/:id/status', adminMiddleware, async (req, res) => {
  try {
    const allowedStatuses = ['PLACED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'RETURNED', 'CANCELLED'];
    const status = String(req.body?.status || '').toUpperCase();
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid order status' });
    }
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid order id' });
    }

    const existingOrder = await Order.findById(req.params.id);
    if (!existingOrder) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (['DELIVERED', 'CANCELLED', 'RETURNED'].includes(existingOrder.status) && status !== existingOrder.status) {
      return res.status(409).json({ message: `${existingOrder.status} orders are locked` });
    }

    if (existingOrder.status !== 'CANCELLED' && status === 'CANCELLED') {
      if (!(await restoreOrderStock(existingOrder))) return res.status(409).json({ message: 'Unable to restore all product stock' });
    }

    if (existingOrder.status === 'CANCELLED' && status !== 'CANCELLED') {
      const reservedItems = [];
      for (const item of existingOrder.items) {
        const product = await Product.findOneAndUpdate(
          { _id: item.productId, inStock: true, stock: { $gte: item.quantity } },
          { $inc: { stock: -item.quantity } },
          { returnDocument: 'after' }
        );
        if (!product) {
          await Promise.all(reservedItems.map((reservedItem) =>
            Product.updateOne(
              { _id: reservedItem.productId },
              { $inc: { stock: reservedItem.quantity } }
            )
          ));
          return res.status(409).json({ message: 'Order cannot be reopened because stock is unavailable' });
        }
        reservedItems.push(item);
      }
    }

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status },
      { returnDocument: 'after', runValidators: true }
    );
    res.status(200).json({ message: 'Order status updated', order });
  } catch (error) {
    res.status(400).json({ message: 'Failed to update order status', error: error.message });
  }
});

router.get('/:id', authMiddleware, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid order id' });
    }

    const order = await Order.findOne({
      _id: req.params.id,
      userId: req.user.id,
    });
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    res.status(200).json({ order });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch order', error: error.message });
  }
});

router.post('/payment-order', authMiddleware, async (req, res) => {
  try {
    const razorpay = getRazorpayClient();
    if (!razorpay) {
      return res.status(503).json({ message: 'Razorpay is not configured on the server' });
    }

    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const requestedItems = items.map((item) => ({
      productId: String(item.productId || item.id || item._id || ''),
      quantity: Number(item.quantity),
    }));
    if (!requestedItems.length || requestedItems.some((item) => !mongoose.isValidObjectId(item.productId) || !Number.isInteger(item.quantity) || item.quantity < 1)) {
      return res.status(400).json({ message: 'A valid cart is required to initialize payment' });
    }

    const products = await Product.find({
      _id: { $in: requestedItems.map((item) => item.productId) },
    });
    const productsById = new Map(products.map((product) => [String(product._id), product]));
    if (requestedItems.some((item) => !productsById.has(item.productId)) || products.some((product) => !product.inStock)) {
      return res.status(400).json({ message: 'Cart contains an unavailable product' });
    }
    const amount = requestedItems.reduce((sum, item) => sum + productsById.get(item.productId).price * item.quantity, 0);

    const paymentOrder = await razorpay.orders.create({
      amount: Math.round(amount * 100),
      currency: 'INR',
      receipt: `vastra_${Date.now()}`,
    });

    res.status(201).json({
      orderId: paymentOrder.id,
      amount: paymentOrder.amount,
      currency: paymentOrder.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    res.status(502).json({ message: 'Unable to create Razorpay payment order', error: error.message });
  }
});

router.post('/checkout', authMiddleware, async (req, res) => {
  try {
    const {
      items = [],
      shippingAddress = {},
      paymentMethod = 'cash',
      razorpayOrderId = '',
      razorpayPaymentId = '',
      razorpaySignature = '',
    } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Cart is empty' });
    }

    const requestedItems = items.map((item) => ({
      productId: String(item.productId || item.id || item._id || ''),
      quantity: Number(item.quantity),
    }));

    if (requestedItems.some((item) => !mongoose.isValidObjectId(item.productId) || !Number.isInteger(item.quantity) || item.quantity < 1)) {
      return res.status(400).json({ message: 'Cart contains an invalid product or quantity' });
    }

    await Product.updateMany(
      { stock: { $exists: false } },
      { $set: { stock: 10 } }
    );

    const products = await Product.find({
      _id: { $in: requestedItems.map((item) => item.productId) },
    });
    const productsById = new Map(products.map((product) => [String(product._id), product]));

    if (requestedItems.some((item) => !productsById.has(item.productId))) {
      return res.status(400).json({ message: 'Cart contains a product that no longer exists' });
    }

    if (products.some((product) => !product.inStock)) {
      return res.status(400).json({ message: 'Cart contains an unavailable product' });
    }

    const normalizedItems = requestedItems.map((item) => {
      const product = productsById.get(item.productId);
      return {
        productId: String(product._id),
        name: product.name,
        image: product.image,
        price: product.price,
        quantity: item.quantity,
      };
    });
    const calculatedTotal = normalizedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

    if (paymentMethod === 'razorpay') {
      const razorpay = getRazorpayClient();
      if (!razorpay) {
        return res.status(503).json({ message: 'Razorpay is not configured on the server' });
      }
      if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
        return res.status(400).json({ message: 'Razorpay payment details are required' });
      }

      const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(`${razorpayOrderId}|${razorpayPaymentId}`)
        .digest('hex');
      const expectedSignatureBuffer = Buffer.from(expectedSignature, 'utf8');
      const receivedSignatureBuffer = Buffer.from(razorpaySignature, 'utf8');
      if (expectedSignatureBuffer.length !== receivedSignatureBuffer.length || !crypto.timingSafeEqual(expectedSignatureBuffer, receivedSignatureBuffer)) {
        return res.status(400).json({ message: 'Razorpay payment signature is invalid' });
      }

      const paymentOrder = await razorpay.orders.fetch(razorpayOrderId);
      if (paymentOrder.amount !== Math.round(calculatedTotal * 100) || paymentOrder.currency !== 'INR') {
        return res.status(400).json({ message: 'Razorpay payment amount does not match the order' });
      }
    } else if (paymentMethod !== 'cash') {
      return res.status(400).json({ message: 'Unsupported payment method' });
    }

    const reservedItems = [];
    for (const item of requestedItems) {
      const reservedProduct = await Product.findOneAndUpdate(
        {
          _id: item.productId,
          inStock: true,
          stock: { $gte: item.quantity },
        },
        { $inc: { stock: -item.quantity } },
        { returnDocument: 'after' }
      );

      if (!reservedProduct) {
        await Promise.all(reservedItems.map((reservedItem) =>
          Product.updateOne(
            { _id: reservedItem.productId },
            { $inc: { stock: reservedItem.quantity } }
          )
        ));
        return res.status(409).json({ message: 'One or more products do not have enough stock' });
      }
      reservedItems.push(item);
    }

    let order;
    try {
      order = await Order.create({
        userId: req.user.id,
        items: normalizedItems,
        total: calculatedTotal,
        paymentMethod,
        paymentStatus: paymentMethod === 'razorpay' ? 'paid' : 'pending',
        razorpayOrderId: paymentMethod === 'razorpay' ? razorpayOrderId : '',
        razorpayPaymentId: paymentMethod === 'razorpay' ? razorpayPaymentId : '',
        shippingAddress: {
          fullName: shippingAddress.fullName || '',
          email: shippingAddress.email || '',
          mobile: shippingAddress.mobile || '',
          address: shippingAddress.address || '',
          city: shippingAddress.city || '',
          state: shippingAddress.state || '',
          zipCode: shippingAddress.zipCode || '',
        },
      });
    } catch (error) {
      await Promise.all(reservedItems.map((reservedItem) =>
        Product.updateOne(
          { _id: reservedItem.productId },
          { $inc: { stock: reservedItem.quantity } }
        )
      ));
      throw error;
    }

    res.status(201).json({
      message: 'Order placed successfully',
      order,
    });
  } catch (error) {
    res.status(500).json({ message: 'Checkout failed', error: error.message });
  }
});

module.exports = router;
