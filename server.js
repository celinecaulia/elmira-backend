const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/elmira_salon';

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ Berhasil terhubung ke MongoDB'))
  .catch((err) => console.error('❌ Gagal terhubung ke MongoDB:', err));

// Routes
app.use('/api/bookings', require('./routes/bookingRoutes'));

app.listen(PORT, () => {
  console.log(`🚀 Server backend berjalan di port ${PORT}`);
});