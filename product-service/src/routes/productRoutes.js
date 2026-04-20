const express = require('express');
const router = express.Router();
const axios = require('axios');
const Product = require('../models/Product');
const { logOutgoingCall } = require('../trafficLogger');

const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL || 'http://order-service:4003';
const SERVICE_NAME = 'product-service';

// GET all products
router.get('/', async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message, service: 'product-service' });
  }
});

// GET single product
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message, service: 'product-service' });
  }
});

// POST create product
router.post('/', async (req, res) => {
  try {
    const { name, description, price, stock, category } = req.body;
    const product = new Product({ name, description, price, stock, category });
    await product.save();
    res.status(201).json({
      ...product.toObject(),
      _flow: {
        service: 'product-service',
        action: 'CREATE',
        database: 'MongoDB (product-db)',
        collection: 'products',
        payload: { name, description, price, stock, category },
      },
    });
  } catch (err) {
    res.status(400).json({ error: err.message, service: 'product-service' });
  }
});

// PUT update product
router.put('/:id', async (req, res) => {
  try {
    const { name, description, price, stock, category } = req.body;
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { name, description, price, stock, category },
      { new: true, runValidators: true }
    );
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json({
      ...product.toObject(),
      _flow: {
        service: 'product-service',
        action: 'UPDATE',
        database: 'MongoDB (product-db)',
        collection: 'products',
      },
    });
  } catch (err) {
    res.status(400).json({ error: err.message, service: 'product-service' });
  }
});

// DELETE product (calls order-service to check if product is in active orders)
router.delete('/:id', async (req, res) => {
  const traceId = req.traceId || req.headers['x-trace-id'] || 'no-trace';
  const hops = [];

  try {
    // Step 1: Check if product is in any active orders
    try {
      const start = Date.now();
      const orderResp = await axios.get(`${ORDER_SERVICE_URL}/api/orders?productId=${req.params.id}`, {
        headers: { 'x-trace-id': traceId, 'x-source-service': SERVICE_NAME },
        timeout: 5000,
      });
      const duration = Date.now() - start;
      const activeOrders = (orderResp.data || []).filter(o => !['delivered', 'cancelled'].includes(o.status));
      hops.push({ from: SERVICE_NAME, to: 'order-service', action: 'CHECK active orders for product', duration, status: 'success', activeOrders: activeOrders.length });
      logOutgoingCall(SERVICE_NAME, { traceId, method: 'GET', url: `/api/orders?productId=${req.params.id}`, targetService: 'order-service', duration, statusCode: 200 });

      if (activeOrders.length > 0) {
        return res.status(400).json({
          error: `Cannot delete product with ${activeOrders.length} active order(s)`,
          _trace: { traceId, hops },
        });
      }
    } catch (err) {
      hops.push({ from: SERVICE_NAME, to: 'order-service', action: 'CHECK orders', status: 'failed (proceeding)', error: err.message });
      logOutgoingCall(SERVICE_NAME, { traceId, method: 'GET', url: `/api/orders?productId=${req.params.id}`, targetService: 'order-service', statusCode: 500, error: err.message });
    }

    // Step 2: Delete product
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    hops.push({ from: SERVICE_NAME, to: 'MongoDB (product-db)', action: 'DELETE product', status: 'success' });

    res.json({
      message: 'Product deleted',
      _flow: {
        service: SERVICE_NAME,
        action: 'DELETE',
        interServiceCalls: ['order-service (check orders)'],
        database: 'MongoDB (product-db)',
        deletedId: req.params.id,
      },
      _trace: { traceId, hops },
    });
  } catch (err) {
    res.status(500).json({ error: err.message, service: SERVICE_NAME });
  }
});

// GET product stats (calls order-service for order count)
router.get('/:id/stats', async (req, res) => {
  const traceId = req.traceId || req.headers['x-trace-id'] || 'no-trace';
  const hops = [];

  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    hops.push({ from: SERVICE_NAME, to: 'MongoDB (product-db)', action: 'FIND product', status: 'success' });

    let orderStats = { totalOrders: 0, totalQuantitySold: 0 };
    try {
      const start = Date.now();
      const orderResp = await axios.get(`${ORDER_SERVICE_URL}/api/orders?productId=${req.params.id}`, {
        headers: { 'x-trace-id': traceId, 'x-source-service': SERVICE_NAME },
        timeout: 5000,
      });
      const duration = Date.now() - start;
      const orders = orderResp.data || [];
      orderStats.totalOrders = orders.length;
      orderStats.totalQuantitySold = orders.reduce((sum, o) => {
        const item = (o.items || []).find(i => i.productId === req.params.id);
        return sum + (item ? item.quantity : 0);
      }, 0);
      hops.push({ from: SERVICE_NAME, to: 'order-service', action: `GET /api/orders?productId=${req.params.id}`, duration, status: 'success' });
      logOutgoingCall(SERVICE_NAME, { traceId, method: 'GET', url: `/api/orders?productId=${req.params.id}`, targetService: 'order-service', duration, statusCode: 200 });
    } catch (err) {
      hops.push({ from: SERVICE_NAME, to: 'order-service', action: 'GET order stats', status: 'failed', error: err.message });
      logOutgoingCall(SERVICE_NAME, { traceId, method: 'GET', url: `/api/orders?productId=${req.params.id}`, targetService: 'order-service', statusCode: 500, error: err.message });
    }

    res.json({
      ...product.toObject(),
      orderStats,
      _flow: {
        service: SERVICE_NAME,
        action: 'GET_STATS',
        interServiceCalls: ['order-service'],
        databases: ['product-db (read)'],
      },
      _trace: { traceId, hops },
    });
  } catch (err) {
    res.status(500).json({ error: err.message, service: SERVICE_NAME });
  }
});

// Internal: reduce stock (called by order-service)
router.patch('/:id/reduce-stock', async (req, res) => {
  try {
    const { quantity } = req.body;
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    if (product.stock < quantity) {
      return res.status(400).json({ error: 'Insufficient stock', available: product.stock });
    }
    product.stock -= quantity;
    await product.save();
    res.json({
      ...product.toObject(),
      _flow: {
        service: 'product-service',
        action: 'REDUCE_STOCK',
        database: 'MongoDB (product-db)',
        collection: 'products',
        quantityReduced: quantity,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message, service: 'product-service' });
  }
});

module.exports = router;
