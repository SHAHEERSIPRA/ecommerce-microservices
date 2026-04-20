const express = require('express');
const router = express.Router();
const axios = require('axios');
const Order = require('../models/Order');
const { logOutgoingCall } = require('../trafficLogger');

const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://user-service:4001';
const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL || 'http://product-service:4002';
const SERVICE_NAME = 'order-service';

// GET all orders (supports ?userId=xxx and ?productId=xxx filters — called by other services)
router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.userId) filter.userId = req.query.userId;
    if (req.query.productId) filter['items.productId'] = req.query.productId;

    const orders = await Order.find(filter).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message, service: SERVICE_NAME });
  }
});

// GET single order (enriches with live user + product data from other services)
router.get('/:id', async (req, res) => {
  const traceId = req.traceId || req.headers['x-trace-id'] || 'no-trace';
  const hops = [];

  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    hops.push({ from: SERVICE_NAME, to: 'MongoDB (order-db)', action: 'FIND order', status: 'success' });

    // Enrich: fetch latest user info
    let liveUser = null;
    try {
      const start = Date.now();
      const userResp = await axios.get(`${USER_SERVICE_URL}/api/users/${order.userId}`, {
        headers: { 'x-trace-id': traceId, 'x-source-service': SERVICE_NAME },
        timeout: 5000,
      });
      liveUser = userResp.data;
      const duration = Date.now() - start;
      hops.push({ from: SERVICE_NAME, to: 'user-service', action: `GET /api/users/${order.userId}`, duration, status: 'success' });
      logOutgoingCall(SERVICE_NAME, { traceId, method: 'GET', url: `/api/users/${order.userId}`, targetService: 'user-service', duration, statusCode: 200 });
    } catch (err) {
      hops.push({ from: SERVICE_NAME, to: 'user-service', action: 'GET user', status: 'failed', error: err.message });
      logOutgoingCall(SERVICE_NAME, { traceId, method: 'GET', url: `/api/users/${order.userId}`, targetService: 'user-service', statusCode: 500, error: err.message });
    }

    // Enrich: fetch latest product info for each item
    const liveItems = [];
    for (const item of order.items) {
      try {
        const start = Date.now();
        const prodResp = await axios.get(`${PRODUCT_SERVICE_URL}/api/products/${item.productId}`, {
          headers: { 'x-trace-id': traceId, 'x-source-service': SERVICE_NAME },
          timeout: 5000,
        });
        const duration = Date.now() - start;
        liveItems.push({ ...item.toObject(), liveProduct: { name: prodResp.data.name, currentStock: prodResp.data.stock, currentPrice: prodResp.data.price } });
        hops.push({ from: SERVICE_NAME, to: 'product-service', action: `GET /api/products/${item.productId}`, duration, status: 'success' });
        logOutgoingCall(SERVICE_NAME, { traceId, method: 'GET', url: `/api/products/${item.productId}`, targetService: 'product-service', duration, statusCode: 200 });
      } catch (err) {
        liveItems.push({ ...item.toObject(), liveProduct: null });
        hops.push({ from: SERVICE_NAME, to: 'product-service', action: `GET product ${item.productId}`, status: 'failed', error: err.message });
      }
    }

    res.json({
      ...order.toObject(),
      liveUser: liveUser ? { name: liveUser.name, email: liveUser.email } : null,
      liveItems,
      _flow: {
        service: SERVICE_NAME,
        action: 'GET_ORDER_ENRICHED',
        interServiceCalls: ['user-service', 'product-service'],
        databases: ['order-db (read)'],
      },
      _trace: { traceId, hops },
    });
  } catch (err) {
    res.status(500).json({ error: err.message, service: SERVICE_NAME });
  }
});

// POST create order (inter-service calls: validates user + product, reduces stock)
router.post('/', async (req, res) => {
  const traceId = req.traceId || req.headers['x-trace-id'] || 'no-trace';
  const hops = [];

  try {
    const { userId, items } = req.body;

    if (!userId || !items || !items.length) {
      return res.status(400).json({ error: 'userId and items[] are required' });
    }

    // ── Step 1: Validate user exists (call user-service) ──
    let userData;
    try {
      const start = Date.now();
      const userResp = await axios.get(`${USER_SERVICE_URL}/api/users/${userId}`, {
        headers: { 'x-trace-id': traceId, 'x-source-service': SERVICE_NAME },
        timeout: 5000,
      });
      userData = userResp.data;
      const duration = Date.now() - start;
      hops.push({ from: SERVICE_NAME, to: 'user-service', action: `GET /api/users/${userId}`, duration, status: 'success' });
      logOutgoingCall(SERVICE_NAME, { traceId, method: 'GET', url: `/api/users/${userId}`, targetService: 'user-service', duration, statusCode: 200 });
    } catch (err) {
      hops.push({ from: SERVICE_NAME, to: 'user-service', action: `GET /api/users/${userId}`, status: 'failed', error: err.message });
      logOutgoingCall(SERVICE_NAME, { traceId, method: 'GET', url: `/api/users/${userId}`, targetService: 'user-service', statusCode: err.response?.status || 500, error: err.message });
      return res.status(400).json({
        error: 'User validation failed',
        message: err.response?.data?.error || err.message,
        _trace: { traceId, hops },
      });
    }

    // ── Step 2: Validate products & reduce stock (call product-service) ──
    const enrichedItems = [];
    let totalAmount = 0;

    for (const item of items) {
      try {
        const prodStart = Date.now();
        const prodResp = await axios.get(`${PRODUCT_SERVICE_URL}/api/products/${item.productId}`, {
          headers: { 'x-trace-id': traceId, 'x-source-service': SERVICE_NAME },
          timeout: 5000,
        });
        const product = prodResp.data;
        const prodDuration = Date.now() - prodStart;
        hops.push({ from: SERVICE_NAME, to: 'product-service', action: `GET /api/products/${item.productId}`, duration: prodDuration, status: 'success' });
        logOutgoingCall(SERVICE_NAME, { traceId, method: 'GET', url: `/api/products/${item.productId}`, targetService: 'product-service', duration: prodDuration, statusCode: 200 });

        const stockStart = Date.now();
        await axios.patch(
          `${PRODUCT_SERVICE_URL}/api/products/${item.productId}/reduce-stock`,
          { quantity: item.quantity },
          { headers: { 'x-trace-id': traceId, 'x-source-service': SERVICE_NAME }, timeout: 5000 }
        );
        const stockDuration = Date.now() - stockStart;
        hops.push({ from: SERVICE_NAME, to: 'product-service', action: `PATCH /api/products/${item.productId}/reduce-stock`, duration: stockDuration, status: 'success', payload: { quantity: item.quantity } });
        logOutgoingCall(SERVICE_NAME, { traceId, method: 'PATCH', url: `/api/products/${item.productId}/reduce-stock`, targetService: 'product-service', duration: stockDuration, statusCode: 200, payload: { quantity: item.quantity } });

        const lineTotal = product.price * item.quantity;
        totalAmount += lineTotal;
        enrichedItems.push({
          productId: item.productId,
          productName: product.name,
          quantity: item.quantity,
          price: product.price,
        });
      } catch (err) {
        hops.push({ from: SERVICE_NAME, to: 'product-service', action: `product ${item.productId}`, status: 'failed', error: err.response?.data?.error || err.message });
        logOutgoingCall(SERVICE_NAME, { traceId, method: 'GET', url: `/api/products/${item.productId}`, targetService: 'product-service', statusCode: err.response?.status || 500, error: err.message });
        return res.status(400).json({
          error: `Product validation/stock failed for ${item.productId}`,
          message: err.response?.data?.error || err.message,
          _trace: { traceId, hops },
        });
      }
    }

    // ── Step 3: Create order in MongoDB ──
    const order = new Order({
      userId,
      userName: userData.name,
      userEmail: userData.email,
      items: enrichedItems,
      totalAmount,
      status: 'confirmed',
    });
    await order.save();
    hops.push({ from: SERVICE_NAME, to: 'MongoDB (order-db)', action: 'INSERT order', status: 'success' });

    res.status(201).json({
      ...order.toObject(),
      _flow: {
        service: SERVICE_NAME,
        action: 'CREATE_ORDER',
        interServiceCalls: hops.filter(h => h.to !== 'MongoDB (order-db)').length,
        databases: ['user-db (read)', 'product-db (read+write)', 'order-db (write)'],
      },
      _trace: { traceId, hops },
    });
  } catch (err) {
    res.status(500).json({ error: err.message, service: SERVICE_NAME, _trace: { traceId, hops } });
  }
});

// PUT update order status
router.put('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json({
      ...order.toObject(),
      _flow: {
        service: SERVICE_NAME,
        action: 'UPDATE_STATUS',
        database: 'MongoDB (order-db)',
        newStatus: status,
      },
    });
  } catch (err) {
    res.status(400).json({ error: err.message, service: SERVICE_NAME });
  }
});

module.exports = router;
