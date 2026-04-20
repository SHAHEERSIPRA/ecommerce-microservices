const express = require('express');
const router = express.Router();
const axios = require('axios');
const User = require('../models/User');
const { logOutgoingCall } = require('../trafficLogger');

const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL || 'http://order-service:4003';
const SERVICE_NAME = 'user-service';

// GET all users
router.get('/', async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message, service: SERVICE_NAME });
  }
});

// GET single user
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message, service: SERVICE_NAME });
  }
});

// GET user profile with their orders (calls order-service)
router.get('/:id/profile', async (req, res) => {
  const traceId = req.traceId || req.headers['x-trace-id'] || 'no-trace';
  const hops = [];

  try {
    // Step 1: Get user from local DB
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    hops.push({ from: SERVICE_NAME, to: 'MongoDB (user-db)', action: 'FIND user', status: 'success' });

    // Step 2: Call order-service to get this user's orders
    let orders = [];
    try {
      const start = Date.now();
      const orderResp = await axios.get(`${ORDER_SERVICE_URL}/api/orders?userId=${req.params.id}`, {
        headers: { 'x-trace-id': traceId, 'x-source-service': SERVICE_NAME },
        timeout: 5000,
      });
      orders = orderResp.data;
      const duration = Date.now() - start;
      hops.push({ from: SERVICE_NAME, to: 'order-service', action: `GET /api/orders?userId=${req.params.id}`, duration, status: 'success' });
      logOutgoingCall(SERVICE_NAME, { traceId, method: 'GET', url: `/api/orders?userId=${req.params.id}`, targetService: 'order-service', duration, statusCode: 200 });
    } catch (err) {
      hops.push({ from: SERVICE_NAME, to: 'order-service', action: 'GET orders', status: 'failed', error: err.message });
      logOutgoingCall(SERVICE_NAME, { traceId, method: 'GET', url: `/api/orders?userId=${req.params.id}`, targetService: 'order-service', statusCode: err.response?.status || 500, error: err.message });
    }

    res.json({
      ...user.toObject(),
      orders,
      orderCount: orders.length,
      _flow: {
        service: SERVICE_NAME,
        action: 'GET_PROFILE',
        interServiceCalls: ['order-service'],
        databases: ['user-db (read)'],
      },
      _trace: { traceId, hops },
    });
  } catch (err) {
    res.status(500).json({ error: err.message, service: SERVICE_NAME, _trace: { traceId, hops } });
  }
});

// POST create user
router.post('/', async (req, res) => {
  try {
    const { name, email, role } = req.body;
    const user = new User({ name, email, role });
    await user.save();
    res.status(201).json({
      ...user.toObject(),
      _flow: {
        service: SERVICE_NAME,
        action: 'CREATE',
        database: 'MongoDB (user-db)',
        collection: 'users',
        payload: { name, email, role },
      },
    });
  } catch (err) {
    res.status(400).json({ error: err.message, service: SERVICE_NAME });
  }
});

// PUT update user
router.put('/:id', async (req, res) => {
  try {
    const { name, email, role } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { name, email, role },
      { new: true, runValidators: true }
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
      ...user.toObject(),
      _flow: {
        service: SERVICE_NAME,
        action: 'UPDATE',
        database: 'MongoDB (user-db)',
        collection: 'users',
      },
    });
  } catch (err) {
    res.status(400).json({ error: err.message, service: SERVICE_NAME });
  }
});

// DELETE user (calls order-service to check for active orders first)
router.delete('/:id', async (req, res) => {
  const traceId = req.traceId || req.headers['x-trace-id'] || 'no-trace';
  const hops = [];

  try {
    // Step 1: Check if user has active orders via order-service
    try {
      const start = Date.now();
      const orderResp = await axios.get(`${ORDER_SERVICE_URL}/api/orders?userId=${req.params.id}`, {
        headers: { 'x-trace-id': traceId, 'x-source-service': SERVICE_NAME },
        timeout: 5000,
      });
      const duration = Date.now() - start;
      const activeOrders = (orderResp.data || []).filter(o => !['delivered', 'cancelled'].includes(o.status));
      hops.push({ from: SERVICE_NAME, to: 'order-service', action: 'CHECK active orders', duration, status: 'success', activeOrders: activeOrders.length });
      logOutgoingCall(SERVICE_NAME, { traceId, method: 'GET', url: `/api/orders?userId=${req.params.id}`, targetService: 'order-service', duration, statusCode: 200 });

      if (activeOrders.length > 0) {
        return res.status(400).json({
          error: `Cannot delete user with ${activeOrders.length} active order(s)`,
          activeOrders: activeOrders.length,
          _trace: { traceId, hops },
        });
      }
    } catch (err) {
      // If order-service is down, proceed with deletion (graceful degradation)
      hops.push({ from: SERVICE_NAME, to: 'order-service', action: 'CHECK active orders', status: 'failed (proceeding)', error: err.message });
      logOutgoingCall(SERVICE_NAME, { traceId, method: 'GET', url: `/api/orders?userId=${req.params.id}`, targetService: 'order-service', statusCode: 500, error: err.message });
    }

    // Step 2: Delete user
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    hops.push({ from: SERVICE_NAME, to: 'MongoDB (user-db)', action: 'DELETE user', status: 'success' });

    res.json({
      message: 'User deleted',
      _flow: {
        service: SERVICE_NAME,
        action: 'DELETE',
        interServiceCalls: ['order-service (check orders)'],
        database: 'MongoDB (user-db)',
        deletedId: req.params.id,
      },
      _trace: { traceId, hops },
    });
  } catch (err) {
    res.status(500).json({ error: err.message, service: SERVICE_NAME });
  }
});

module.exports = router;

module.exports = router;
