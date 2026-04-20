const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const morgan = require('morgan');
const { trafficMiddleware, getLog, clearLog } = require('./trafficLogger');
const userRoutes = require('./routes/userRoutes');

const app = express();
const PORT = process.env.PORT || 4001;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://mongo:27017/userdb';
const SERVICE_NAME = 'user-service';

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

app.use('/api/users', userRoutes);

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log('✅ User Service connected to MongoDB');
    app.listen(PORT, () => console.log(`👤 User Service running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  });
