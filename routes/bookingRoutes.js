const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking');
const midtransClient = require('midtrans-client');
require('dotenv').config();

// Import middleware pengaman Owner dan Admin dari authMiddleware.js
const { verifyOwnerRole, verifyAdminRole } = require('../middleware/authMiddleware');

// Inisialisasi Midtrans Snap
let snap = new midtransClient.Snap({
    isProduction: false, // Ubah ke true jika sudah live/production
    serverKey: process.env.MIDTRANS_SERVER_KEY,
    clientKey: process.env.MIDTRANS_CLIENT_KEY
});

// =========================================================================
// ENDPOINT KHUSUS ADMIN (TERPROTEKSI MIDDLEWARE - TOLAK 403 JIKA BUKAN ADMIN)
// =========================================================================
router.get('/', verifyAdminRole, async (req, res) => {
  try {
    const bookings = await Booking.find().sort({ createdAt: -1 });
    res.json(bookings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST: Membuat booking baru DAN meminta Token Midtrans (Publik)
router.post('/', async (req, res) => {
  try {
    const { fullName, email, whatsapp, date, time, services } = req.body;
    
    // Validasi Kuota Harian
    const maxDailyQuota = 5; // Batas maksimal kuota per hari
    const existingBookingsCount = await Booking.countDocuments({ date: date, status: { $ne: 'Cancelled' } });
    
    if (existingBookingsCount >= maxDailyQuota) {
      return res.status(400).json({ error: 'Mohon maaf, kuota reservasi untuk tanggal ' + date + ' sudah penuh (Full).' });
    }

    // 1. Simpan data ke MongoDB
    const newBooking = new Booking({ 
      fullName, 
      email, 
      whatsapp, 
      date, 
      time, 
      services,
      status: 'Pending' 
    });
    const savedBooking = await newBooking.save();

    // 2. Buat ID unik untuk transaksi Midtrans
    const orderId = 'ELMIRA-' + savedBooking._id + '-' + Date.now();

    // [DIREVISI] 3. Hitung total harga otomatis dari array services yang dipilih pelanggan
    let calculatedTotal = 0;
    if (services && services.length > 0) {
      services.forEach(srv => {
        // Ekstrak angka dari format "Hair Cut - Rp. 35.000" menggunakan Regex
        const match = srv.match(/Rp\.?\s*([\d\.]+)/i);
        if (match && match[1]) {
          calculatedTotal += parseInt(match[1].replace(/\./g, '')); // Bersihkan titik jadi angka murni
        }
      });
    }
    
    // Fallback jika tidak ada layanan tercentang, cegah error nominal 0 di Midtrans
    const grossAmount = calculatedTotal > 0 ? calculatedTotal : 150000; 

    let parameter = {
        transaction_details: {
            order_id: orderId,
            gross_amount: grossAmount
        },
        customer_details: {
            first_name: fullName,
            email: email,
            phone: whatsapp
        }
    };

    // 4. Minta Snap Token ke Midtrans
    const transaction = await snap.createTransaction(parameter);

    res.status(201).json({ 
      message: 'Booking berhasil disimpan & token Midtrans dibuat!', 
      data: savedBooking,
      token: transaction.token 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT: Update status booking (Terproteksi Admin)
router.put('/:id', verifyAdminRole, async (req, res) => {
  try {
    const { status } = req.body;
    const updated = await Booking.findByIdAndUpdate(req.params.id, { status }, { new: true });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE: Hapus booking (Terproteksi Admin)
router.delete('/:id', verifyAdminRole, async (req, res) => {
  try {
    await Booking.findByIdAndDelete(req.params.id);
    res.json({ message: 'Booking berhasil dihapus' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =========================================================================
// POST: Menerima Webhook / Notifikasi Otomatis langsung dari Midtrans (Publik)
// =========================================================================
router.post('/notification', async (req, res) => {
  try {
    // 1. Verifikasi data webhook pakai fungsi bawaan Midtrans
    const statusResponse = await snap.transaction.notification(req.body);
    
    let orderId = statusResponse.order_id;
    let transactionStatus = statusResponse.transaction_status;
    let fraudStatus = statusResponse.fraud_status;

    // 2. Ekstrak ID Booking dari format orderId (ELMIRA-{id}-{timestamp})
    const bookingId = orderId.split('-')[1];

    // 3. Tentukan status baru sesuai laporan dari server Midtrans
    let newStatus = 'Pending';
    
    if (transactionStatus === 'capture' || transactionStatus === 'settlement') {
      if (fraudStatus === 'challenge') {
        newStatus = 'Pending';
      } else if (fraudStatus === 'accept' || transactionStatus === 'settlement') {
        newStatus = 'Confirmed'; // LUNAS!
      }
    } else if (transactionStatus === 'cancel' || transactionStatus === 'deny' || transactionStatus === 'expire') {
      newStatus = 'Cancelled'; // BATAL/KEDALUWARSA! Slot kuota akan otomatis kembali terbuka
    } else if (transactionStatus === 'pending') {
      newStatus = 'Pending';
    }

    // 4. Update status di MongoDB tanpa menghapus data sama sekali
    await Booking.findByIdAndUpdate(bookingId, { status: newStatus });

    // 5. Beri kode 200 OK ke Midtrans biar dia tau laporannya sukses diterima
    res.status(200).json({ status: 'OK', message: 'Notifikasi Midtrans berhasil diproses dan status diupdate.' });
  } catch (error) {
    console.error('Error saat memproses notifikasi Midtrans:', error);
    res.status(500).json({ error: error.message });
  }
});

// =========================================================================
// RUTE BARU KHUSUS KUOTA KALENDER (PUBLIK - TANPA MIDDLEWARE ADMIN)
// =========================================================================
router.get('/quota', async (req, res) => {
  try {
    // Hanya ambil tanggal dan status untuk keperluan penghitungan kuota, hindari data pribadi
    const bookings = await Booking.find({}, 'date status');
    res.status(200).json({ success: true, data: bookings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// =========================================================================
// ENDPOINT KHUSUS OWNER (TERPROTEKSI MIDDLEWARE - TOLAK 403 JIKA BUKAN OWNER)
// =========================================================================
router.get('/owner-analytics', verifyOwnerRole, async (req, res) => {
  try {
    const allBookings = await Booking.find().sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      message: 'Akses Owner Terverifikasi',
      data: allBookings,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;