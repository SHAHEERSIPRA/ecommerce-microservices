import axios from 'axios';

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'https://mydashboardnew.duckdns.org';

// NEVER allow undefined anywhere
const safeBase = API_BASE || 'https://mydashboardnew.duckdns.org';

const api = axios.create({
  baseURL: safeBase,
});

// ── SAFE HELPERS ──
const safeEntries = (obj) => Object.entries(obj || {});

// ── HEALTH ──
export const getServicesHealth = async () => {
  try {
    const res = await api.get('/api/health');
    return res.data;
  } catch (err) {
    return { status: 'error', message: err.message };
  }
};

// ── TRAFFIC ──
export const getTraffic = async () => {
  try {
    const res = await api.get('/api/traffic');
    return res.data || [];
  } catch {
    return [];
  }
};

export const clearTraffic = async () => {
  try {
    await api.delete('/api/traffic');
  } catch {}
};

// ── USERS ──
export const getUsers = () => api.get('/api/users');
export const getUser = (id) => api.get(`/api/users/${id}`);
export const getUserProfile = (id) => api.get(`/api/users/${id}/profile`);
export const createUser = (data) => api.post('/api/users', data);
export const updateUser = (id, data) => api.put(`/api/users/${id}`, data);
export const deleteUser = (id) => api.delete(`/api/users/${id}`);

// ── PRODUCTS ──
export const getProducts = () => api.get('/api/products');
export const getProduct = (id) => api.get(`/api/products/${id}`);
export const getProductStats = (id) => api.get(`/api/products/${id}/stats`);
export const createProduct = (data) => api.post('/api/products', data);
export const updateProduct = (id, data) => api.put(`/api/products/${id}`, data);
export const deleteProduct = (id) => api.delete(`/api/products/${id}`);

// ── ORDERS ──
export const getOrders = () => api.get('/api/orders');
export const getOrder = (id) => api.get(`/api/orders/${id}`);
export const createOrder = (data) => api.post('/api/orders', data);
export const updateOrderStatus = (id, status) =>
  api.put(`/api/orders/${id}/status`, { status });
