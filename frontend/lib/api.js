import axios from 'axios';

const USER_SERVICE = process.env.NEXT_PUBLIC_USER_SERVICE_URL || 'http://localhost:4001';
const PRODUCT_SERVICE = process.env.NEXT_PUBLIC_PRODUCT_SERVICE_URL || 'http://localhost:4002';
const ORDER_SERVICE = process.env.NEXT_PUBLIC_ORDER_SERVICE_URL || 'http://localhost:4003';

const userApi = axios.create({ baseURL: USER_SERVICE });
const productApi = axios.create({ baseURL: PRODUCT_SERVICE });
const orderApi = axios.create({ baseURL: ORDER_SERVICE });

export const SERVICES = {
  'user-service': USER_SERVICE,
  'product-service': PRODUCT_SERVICE,
  'order-service': ORDER_SERVICE,
};

// ── Health ──
export const getServicesHealth = async () => {
  const results = {};
  for (const [name, url] of Object.entries(SERVICES)) {
    try {
      const res = await axios.get(`${url}/health`, { timeout: 3000 });
      results[name] = { status: 'healthy', data: res.data };
    } catch (err) {
      results[name] = { status: 'unhealthy', error: err.message };
    }
  }
  return results;
};

// ── Traffic (aggregated from all services) ──
export const getTraffic = async () => {
  const all = [];
  for (const [, url] of Object.entries(SERVICES)) {
    try {
      const res = await axios.get(`${url}/traffic`, { timeout: 3000 });
      all.push(...res.data);
    } catch (e) { /* service might be down */ }
  }
  const seen = new Set();
  return all
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .filter(entry => {
      if (seen.has(entry.id)) return false;
      seen.add(entry.id);
      return true;
    });
};

export const clearTraffic = async () => {
  for (const url of Object.values(SERVICES)) {
    try { await axios.delete(`${url}/traffic`, { timeout: 3000 }); } catch (e) { /* ignore */ }
  }
};

// ── Users ──
export const getUsers = () => userApi.get('/api/users');
export const getUser = (id) => userApi.get(`/api/users/${id}`);
export const getUserProfile = (id) => userApi.get(`/api/users/${id}/profile`);
export const createUser = (data) => userApi.post('/api/users', data);
export const updateUser = (id, data) => userApi.put(`/api/users/${id}`, data);
export const deleteUser = (id) => userApi.delete(`/api/users/${id}`);

// ── Products ──
export const getProducts = () => productApi.get('/api/products');
export const getProduct = (id) => productApi.get(`/api/products/${id}`);
export const getProductStats = (id) => productApi.get(`/api/products/${id}/stats`);
export const createProduct = (data) => productApi.post('/api/products', data);
export const updateProduct = (id, data) => productApi.put(`/api/products/${id}`, data);
export const deleteProduct = (id) => productApi.delete(`/api/products/${id}`);

// ── Orders ──
export const getOrders = () => orderApi.get('/api/orders');
export const getOrder = (id) => orderApi.get(`/api/orders/${id}`);
export const createOrder = (data) => orderApi.post('/api/orders', data);
export const updateOrderStatus = (id, status) => orderApi.put(`/api/orders/${id}/status`, { status });
