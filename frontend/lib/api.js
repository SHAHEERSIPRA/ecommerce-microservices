import axios from 'axios';

// =========================
// SINGLE API GATEWAY (NGINX)
// =========================
const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'http://4.186.31.149';

// =========================
// AXIOS INSTANCES
// =========================
const userApi = axios.create({
  baseURL: `${API_BASE}/users`,
});

const productApi = axios.create({
  baseURL: `${API_BASE}/products`,
});

const orderApi = axios.create({
  baseURL: `${API_BASE}/orders`,
});

// =========================
// SERVICES MAP (for health/traffic)
// =========================
export const SERVICES = {
  'user-service': `${API_BASE}/users`,
  'product-service': `${API_BASE}/products`,
  'order-service': `${API_BASE}/orders`,
};

// =========================
// HEALTH CHECK (VIA NGINX)
// =========================
export const getServicesHealth = async () => {
  const results = {};

  for (const [name, url] of Object.entries(SERVICES)) {
    try {
      const res = await axios.get(`${url}/health`, {
        timeout: 3000,
      });

      results[name] = {
        status: 'healthy',
        data: res.data,
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
// TRAFFIC (AGGREGATED)
// =========================
export const getTraffic = async () => {
  const all = [];

  for (const [, url] of Object.entries(SERVICES)) {
    try {
      const res = await axios.get(`${url}/traffic`, {
        timeout: 3000,
      });

      all.push(...res.data);
    } catch (e) {
      // ignore service failures
    }
  }

  const seen = new Set();

  return all
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .filter((entry) => {
      if (seen.has(entry.id)) return false;
      seen.add(entry.id);
      return true;
    });
};

// =========================
// CLEAR TRAFFIC
// =========================
export const clearTraffic = async () => {
  for (const url of Object.values(SERVICES)) {
    try {
      await axios.delete(`${url}/traffic`, {
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
export const getUsers = () => userApi.get('/');
export const getUser = (id) => userApi.get(`/${id}`);
export const getUserProfile = (id) => userApi.get(`/${id}/profile`);
export const createUser = (data) => userApi.post('/', data);
export const updateUser = (id, data) => userApi.put(`/${id}`, data);
export const deleteUser = (id) => userApi.delete(`/${id}`);

// =========================
// PRODUCTS
// =========================
export const getProducts = () => productApi.get('/');
export const getProduct = (id) => productApi.get(`/${id}`);
export const getProductStats = (id) => productApi.get(`/${id}/stats`);
export const createProduct = (data) => productApi.post('/', data);
export const updateProduct = (id, data) => productApi.put(`/${id}`, data);
export const deleteProduct = (id) => productApi.delete(`/${id}`);

// =========================
// ORDERS
// =========================
export const getOrders = () => orderApi.get('/');
export const getOrder = (id) => orderApi.get(`/${id}`);
export const createOrder = (data) => orderApi.post('/', data);
export const updateOrderStatus = (id, status) =>
  orderApi.put(`/${id}/status`, { status });
