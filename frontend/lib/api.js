import axios from 'axios';

// =========================
// SINGLE API GATEWAY (NGINX)
// =========================

// FIX 1: ALWAYS HTTPS in production (no HTTP fallback)
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL;

if (!API_BASE) {
  throw new Error("NEXT_PUBLIC_API_BASE_URL is not defined");
}

// Helper: normalize URL (removes trailing slash issues)
const clean = (url) => (url ? url.replace(/\/$/, '') : url);

// =========================
// AXIOS INSTANCES
// =========================
const userApi = axios.create({
  baseURL: clean(`${API_BASE}/users`),
});

const productApi = axios.create({
  baseURL: clean(`${API_BASE}/products`),
});

const orderApi = axios.create({
  baseURL: clean(`${API_BASE}/orders`),
});

// =========================
// SERVICES MAP
// =========================
export const SERVICES = {
  'user-service': clean(`${API_BASE}/users`),
  'product-service': clean(`${API_BASE}/products`),
  'order-service': clean(`${API_BASE}/orders`),
};

// =========================
// HEALTH CHECK
// =========================
export const getServicesHealth = async () => {
  const results = {};

  for (const [name, url] of Object.entries(SERVICES || {})) {
    try {
      const res = await axios.get(`${clean(url)}/health`, {
        timeout: 3000,
      });

      results[name] = {
        status: 'healthy',
        data: res.data || {}, // FIX 2: null safety
      };
    } catch (err) {
      results[name] = {
        status: 'unhealthy',
        error: err.message,
      };
    }
  }

  return results;
};

// =========================
// TRAFFIC
// =========================
export const getTraffic = async () => {
  const all = [];

  for (const [, url] of Object.entries(SERVICES || {})) {
    try {
      const res = await axios.get(`${clean(url)}/traffic`, {
        timeout: 3000,
      });

      // FIX 3: safe fallback for null/undefined
      all.push(...(res.data || []));
    } catch (e) {
      // ignore service failures
    }
  }

  const seen = new Set();

  return all
    .filter(Boolean)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .filter((entry) => {
      if (!entry?.id) return false;
      if (seen.has(entry.id)) return false;
      seen.add(entry.id);
      return true;
    });
};

// =========================
// CLEAR TRAFFIC
// =========================
export const clearTraffic = async () => {
  for (const url of Object.values(SERVICES || {})) {
    try {
      await axios.delete(`${clean(url)}/traffic`, {
        timeout: 3000,
      });
    } catch (e) {
      // ignore
    }
  }
};

// =========================
// USERS
// =========================
export const getUsers = () => userApi.get('/api/users');
export const getUser = (id) => userApi.get(`/api/users/${id}`);
export const getUserProfile = (id) => userApi.get(`/api/users/${id}/profile`);
export const createUser = (data) => userApi.post('/api/users', data);
export const updateUser = (id, data) => userApi.put(`/api/users/${id}`, data);
export const deleteUser = (id) => userApi.delete(`/api/users/${id}`);

// =========================
// PRODUCTS
// =========================
export const getProducts = () => productApi.get('/api/products');
export const getProduct = (id) => productApi.get(`/api/products/${id}`);
export const getProductStats = (id) => productApi.get(`/api/products/${id}/stats`);
export const createProduct = (data) => productApi.post('/api/products', data);
export const updateProduct = (id, data) => productApi.put(`/api/products/${id}`, data);
export const deleteProduct = (id) => productApi.delete(`/api/products/${id}`);

// =========================
// ORDERS
// =========================
export const getOrders = () => orderApi.get('/api/orders');
export const getOrder = (id) => orderApi.get(`/api/orders/${id}`);
export const createOrder = (data) => orderApi.post('/api/orders', data);
export const updateOrderStatus = (id, status) =>
  orderApi.put(`/api/orders/${id}/status`, { status });
