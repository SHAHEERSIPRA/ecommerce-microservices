const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const morgan = require('morgan');
const { trafficMiddleware, getLog, clearLog } = require('./trafficLogger');
const productRoutes = require('./routes/productRoutes');

const app = express();
const PORT = process.env.PORT || 4002;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://mongo:27017/productdb';
const SERVICE_NAME = 'product-service';

app.use(cors());
app.use(express.json());
app.use(morgan('short'));
app.use(trafficMiddleware(SERVICE_NAME));

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: SERVICE_NAME,
    dbState: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Traffic endpoints
app.get('/traffic', (req, res) => res.json(getLog()));
app.delete('/traffic', (req, res) => { clearLog(); res.json({ message: 'Traffic cleared' }); });

app.use('/api/products', productRoutes);

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log('✅ Product Service connected to MongoDB');
    app.listen(PORT, () => console.log(`📦 Product Service running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  });
