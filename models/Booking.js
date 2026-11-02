const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  email: { type: String, required: true },
  whatsapp: { type: String, required: true },
  date: { type: String, required: true },
  time: { type: String, required: true },
  services: [{ type: String, required: true }],
  status: { type: String, default: 'Pending' },
  createdAt: { type: Date, default: Date.now }
});

// Sistem index TTL (penghapus otomatis 15 menit) sudah dimusnahkan.

module.exports = mongoose.model('Booking', bookingSchema);