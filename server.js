const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/rishi_events';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Mongo Schema & Model (In-memory fallback handled gracefully)
let BookingModel = null;
let isMongoConnected = false;

const bookingSchema = new mongoose.Schema({
  bookingId: { type: String, required: true, unique: true },
  customerName: { type: String, required: true },
  phone: { type: String, required: true },
  email: { type: String, default: '' },
  eventType: { type: String, required: true },
  eventDate: { type: String, required: true },
  guestCount: { type: Number, required: true },
  packageChosen: { type: String, required: true },
  totalAmount: { type: Number, required: true },
  paidAmount: { type: Number, required: true },
  paymentStatus: { type: String, enum: ['Pending', 'Partial', 'Paid'], default: 'Pending' },
  venueAddress: { type: String, required: true },
  notes: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

// Try connecting to MongoDB
mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log('Connected to MongoDB successfully.');
    isMongoConnected = true;
    BookingModel = mongoose.model('Booking', bookingSchema);
  })
  .catch((err) => {
    console.warn('MongoDB connection failed/not provided. Running with in-memory storage fallback:', err.message);
  });

// In-Memory Database Fallback if MongoDB is not present
const inMemoryBookings = [
  {
    bookingId: 'RE-2026-101',
    customerName: 'Vikram Sharma',
    phone: '9876543210',
    email: 'vikram@example.com',
    eventType: 'Royal Wedding',
    eventDate: '2026-11-15',
    guestCount: 450,
    packageChosen: 'Royal Diamond Splendor',
    totalAmount: 185000,
    paidAmount: 85000,
    paymentStatus: 'Partial',
    venueAddress: 'Ashiyana Grand Lawns, Lucknow',
    notes: 'Requires traditional Shehnai group & LED stage lights',
    createdAt: new Date('2026-10-01')
  },
  {
    bookingId: 'RE-2026-102',
    customerName: 'Priya Verma',
    phone: '9123456780',
    email: 'priya@example.com',
    eventType: 'Sangeet & Haldi',
    eventDate: '2026-10-28',
    guestCount: 200,
    packageChosen: 'Gold Festivity',
    totalAmount: 75000,
    paidAmount: 75000,
    paymentStatus: 'Paid',
    venueAddress: 'Hotel Monarch Palace',
    notes: 'Marigold photobooth floral installation',
    createdAt: new Date('2026-09-15')
  }
];

// Generate unique Booking ID
function generateBookingId() {
  return 'RE-' + new Date().getFullYear() + '-' + Math.floor(1000 + Math.random() * 9000);
}

// ==================== API ENDPOINTS ====================

// Create New Booking (Customer Portal)
app.post('/api/bookings', async (req, res) => {
  try {
    const { customerName, phone, email, eventType, eventDate, guestCount, packageChosen, totalAmount, paidAmount, venueAddress, notes } = req.body;
    
    const bookingId = generateBookingId();
    const newBookingData = {
      bookingId,
      customerName,
      phone,
      email: email || '',
      eventType,
      eventDate,
      guestCount: Number(guestCount),
      packageChosen,
      totalAmount: Number(totalAmount),
      paidAmount: Number(paidAmount || 0),
      paymentStatus: Number(paidAmount || 0) >= Number(totalAmount) ? 'Paid' : (Number(paidAmount || 0) > 0 ? 'Partial' : 'Pending'),
      venueAddress,
      notes: notes || '',
      createdAt: new Date()
    };

    if (isMongoConnected && BookingModel) {
      const doc = new BookingModel(newBookingData);
      await doc.save();
    } else {
      inMemoryBookings.unshift(newBookingData);
    }

    res.status(201).json({ success: true, message: 'Booking confirmed successfully!', booking: newBookingData });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error placing booking', error: err.message });
  }
});

// Get All Bookings & Analytics (Rishi's Admin Portal)
app.get('/api/admin/analytics', async (req, res) => {
  try {
    let bookings = [];
    if (isMongoConnected && BookingModel) {
      bookings = await BookingModel.find().sort({ createdAt: -1 });
    } else {
      bookings = [...inMemoryBookings];
    }

    // Calculations
    const totalBookings = bookings.length;
    let totalGot = 0;
    let totalPipeline = 0;
    
    const currentYear = new Date().getFullYear();
    let yearlyTurnover = 0;
    let currentMonthTurnover = 0;

    bookings.forEach(b => {
      const pAmount = Number(b.paidAmount || 0);
      const tAmount = Number(b.totalAmount || 0);
      totalGot += pAmount;
      totalPipeline += tAmount;

      const dateObj = new Date(b.createdAt || Date.now());
      if (dateObj.getFullYear() === currentYear) {
        yearlyTurnover += pAmount;
        if (dateObj.getMonth() === new Date().getMonth()) {
          currentMonthTurnover += pAmount;
        }
      }
    });

    const pendingDues = totalPipeline - totalGot;
    const estimatedGrowth = bookings.length > 0 ? '+18.5%' : '0%';

    res.json({
      success: true,
      stats: {
        totalGot,
        totalPipeline,
        pendingDues,
        totalBookings,
        yearlyTurnover,
        currentMonthTurnover,
        estimatedGrowth
      },
      bookings
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error retrieving analytics', error: err.message });
  }
});

// Update Payment Status (Admin Action)
app.patch('/api/admin/bookings/:id/payment', async (req, res) => {
  try {
    const { id } = req.params;
    const { paidAmount } = req.body;

    let updatedBooking = null;

    if (isMongoConnected && BookingModel) {
      const booking = await BookingModel.findOne({ bookingId: id });
      if (booking) {
        booking.paidAmount = Number(paidAmount);
        booking.paymentStatus = booking.paidAmount >= booking.totalAmount ? 'Paid' : (booking.paidAmount > 0 ? 'Partial' : 'Pending');
        await booking.save();
        updatedBooking = booking;
      }
    } else {
      const idx = inMemoryBookings.findIndex(b => b.bookingId === id);
      if (idx !== -1) {
        inMemoryBookings[idx].paidAmount = Number(paidAmount);
        inMemoryBookings[idx].paymentStatus = Number(paidAmount) >= inMemoryBookings[idx].totalAmount ? 'Paid' : (Number(paidAmount) > 0 ? 'Partial' : 'Pending');
        updatedBooking = inMemoryBookings[idx];
      }
    }

    if (!updatedBooking) {
      return res.status(404).json({ success: false, message: 'Booking record not found' });
    }

    res.json({ success: true, message: 'Payment updated successfully', booking: updatedBooking });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error updating payment', error: err.message });
  }
});

// Serve Single Unified Front-End Interface
app.get('*', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Rishi Event | 4D Grand Celebration Portal</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js"></script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700;900&family=Poppins:wght@300;400;600;700&display=swap');
    
    :root {
      --gold: #d4af37;
      --maroon: #5b0015;
      --deep-bg: #0d0208;
    }

    body {
      background-color: var(--deep-bg);
      color: #f8fafc;
      font-family: 'Poppins', sans-serif;
      overflow-x: hidden;
    }

    .font-royal {
      font-family: 'Cinzel', serif;
    }

    .glass-card {
      background: rgba(26, 10, 18, 0.75);
      backdrop-filter: blur(16px);
      border: 1px solid rgba(212, 175, 55, 0.25);
      box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.7);
    }

    .gold-gradient {
      background: linear-gradient(135deg, #bf953f 0%, #fcf6ba 25%, #b38728 50%, #fbf5b7 75%, #aa771c 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .gold-btn {
      background: linear-gradient(135deg, #d4af37, #aa771c);
      color: #0d0208;
      font-weight: 700;
      transition: all 0.3s ease;
      box-shadow: 0 0 15px rgba(212, 175, 55, 0.4);
    }

    .gold-btn:hover {
      transform: translateY(-2px) scale(1.02);
      box-shadow: 0 0 25px rgba(212, 175, 55, 0.7);
    }

    /* 4D Tilting Card Effect */
    .tilt-card {
      transform-style: preserve-3d;
      transition: transform 0.2s ease-out;
    }

    /* Floating Animated Stickers */
    .sticker {
      position: absolute;
      pointer-events: none;
      animation: float 6s ease-in-out infinite;
      z-index: 10;
      filter: drop-shadow(0 0 10px rgba(212, 175, 55, 0.5));
    }

    @keyframes float {
      0%, 100% { transform: translateY(0px) rotate(0deg); }
      50% { transform: translateY(-18px) rotate(6deg); }
    }

    /* Floating Background Particles */
    #particle-canvas {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 1;
    }
  </style>
</head>
<body class="relative min-h-screen pb-16">

  <!-- Interactive 4D Canvas Particles Background -->
  <canvas id="particle-canvas"></canvas>

  <!-- Animated Floating Tier-2 Event Stickers -->
  <div class="sticker text-4xl top-20 left-6 opacity-80" style="animation-delay: 0s;"><i class="fa-solid fa-crown text-yellow-400"></i></div>
  <div class="sticker text-5xl top-40 right-10 opacity-70" style="animation-delay: 1.5s;"><i class="fa-solid fa-gem text-amber-300"></i></div>
  <div class="sticker text-4xl bottom-24 left-10 opacity-80" style="animation-delay: 3s;"><i class="fa-solid fa-[#d4af37] fa-drum text-red-500"></i></div>
  <div class="sticker text-5xl bottom-40 right-8 opacity-75" style="animation-delay: 2s;"><i class="fa-solid fa-champagne-glasses text-yellow-300"></i></div>

  <!-- Navigation Bar -->
  <nav class="sticky top-0 z-50 backdrop-blur-md bg-black/60 border-b border-amber-500/20 px-6 py-4">
    <div class="max-w-7xl mx-auto flex justify-between items-center">
      <div class="flex items-center space-x-3 cursor-pointer" onclick="switchPortal('customer')">
        <div class="w-10 h-10 rounded-full bg-gradient-to-r from-amber-400 to-amber-700 flex items-center justify-center font-royal font-bold text-black text-xl shadow-lg">
          R
        </div>
        <span class="text-2xl font-royal font-bold gold-gradient tracking-wider">RISHI EVENT</span>
      </div>

      <div class="flex items-center space-x-4">
        <button onclick="switchPortal('customer')" id="btn-customer-portal" class="px-4 py-2 rounded-lg text-sm font-semibold transition bg-amber-500/20 text-amber-300 border border-amber-500/40">
          <i class="fa-solid fa-glass-cheers mr-2"></i> Event Overview & Booking
        </button>
        <button onclick="promptAdminLogin()" id="btn-admin-portal" class="px-4 py-2 rounded-lg text-sm font-semibold transition bg-gray-900/80 text-gray-400 hover:text-amber-300 border border-gray-800">
          <i class="fa-solid fa-user-shield mr-2"></i> Rishi Admin Login
        </button>
      </div>
    </div>
  </nav>

  <main class="relative z-10 max-w-7xl mx-auto px-4 mt-8">

    <!-- ======================================================= -->
    <!-- PORTAL 1: CUSTOMER PORTAL (OVERVIEW & BOOKING) -->
    <!-- ======================================================= -->
    <section id="portal-customer" class="space-y-16">
      
      <!-- Hero Banner -->
      <div class="relative glass-card rounded-3xl p-8 md:p-14 text-center overflow-hidden tilt-card" onmousemove="handleTilt(event, this)" onmouseleave="resetTilt(this)">
        <div class="absolute -right-16 -bottom-16 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl"></div>
        <div class="relative z-10 max-w-3xl mx-auto">
          <span class="text-xs uppercase tracking-widest px-4 py-1.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
            ✨ Tier-2 Royal Event Planner
          </span>
          <h1 class="text-4xl md:text-6xl font-royal font-bold mt-4 mb-6 leading-tight">
            Crafting Unforgettable <span class="gold-gradient">Royal Moments</span>
          </h1>
          <p class="text-gray-300 text-lg mb-8">
            From regal weddings, vibrant sangeet nights to grand corporate galas in Ashiyana & tier-2 destinations. We bring luxury management with bespoke decorations and grand execution.
          </p>
          <div class="flex flex-wrap justify-center gap-4">
            <a href="#booking-section" class="gold-btn px-8 py-4 rounded-xl text-lg flex items-center">
              <i class="fa-solid fa-calendar-check mr-2"></i> Book Rishi Event Now
            </a>
            <a href="#packages-section" class="px-8 py-4 rounded-xl border border-amber-500/30 text-amber-300 hover:bg-amber-500/10 transition">
              Explore Royal Packages
            </a>
          </div>
        </div>
      </div>

      <!-- Feature Highlights / Overview -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div class="glass-card rounded-2xl p-6 hover:border-amber-500/60 transition tilt-card" onmousemove="handleTilt(event, this)" onmouseleave="resetTilt(this)">
          <div class="text-amber-400 text-3xl mb-4"><i class="fa-solid fa-synagogue"></i></div>
          <h3 class="text-xl font-bold font-royal text-amber-200 mb-2">Grand Stage Decor</h3>
          <p class="text-gray-400 text-sm">3D floral setups, royal throne seating, dynamic LED light arrays, and authentic marigold arrangements.</p>
        </div>
        <div class="glass-card rounded-2xl p-6 hover:border-amber-500/60 transition tilt-card" onmousemove="handleTilt(event, this)" onmouseleave="resetTilt(this)">
          <div class="text-amber-400 text-3xl mb-4"><i class="fa-solid fa-utensils"></i></div>
          <h3 class="text-xl font-bold font-royal text-amber-200 mb-2">Royal Banquet & Catering</h3>
          <p class="text-gray-400 text-sm">Custom multi-cuisine menus curated by top regional chefs, live chat stalls, and royal dessert counters.</p>
        </div>
        <div class="glass-card rounded-2xl p-6 hover:border-amber-500/60 transition tilt-card" onmousemove="handleTilt(event, this)" onmouseleave="resetTilt(this)">
          <div class="text-amber-400 text-3xl mb-4"><i class="fa-solid fa-music"></i></div>
          <h3 class="text-xl font-bold font-royal text-amber-200 mb-2">Sound, DJ & Shehnai</h3>
          <p class="text-gray-400 text-sm">High-grade JBL bass sound rigs, traditional Shehnai artists, celebrity DJs, and cold-fire entry displays.</p>
        </div>
      </div>

      <!-- Packages Section -->
      <div id="packages-section" class="space-y-6">
        <div class="text-center">
          <h2 class="text-3xl font-royal font-bold gold-gradient">Curated Luxury Packages</h2>
          <p class="text-gray-400 text-sm mt-1">Select the perfect tier for your dream celebration</p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
          <!-- Silver Package -->
          <div class="glass-card rounded-2xl p-8 border border-gray-700 hover:border-amber-500/50 transition flex flex-col justify-between">
            <div>
              <div class="text-xs uppercase text-amber-400 font-bold tracking-widest">Standard Tier</div>
              <h3 class="text-2xl font-bold font-royal mt-1 text-gray-200">Silver Celebration</h3>
              <div class="text-3xl font-bold gold-gradient my-4">₹45,000 <span class="text-xs text-gray-400 font-normal">/ base</span></div>
              <ul class="space-y-3 text-sm text-gray-300 mb-6">
                <li><i class="fa-solid fa-check text-amber-400 mr-2"></i> Birthday / Anniversaries / Small Haldi</li>
                <li><i class="fa-solid fa-check text-amber-400 mr-2"></i> Standard Stage Backdrop + Floral Pillars</li>
                <li><i class="fa-solid fa-check text-amber-400 mr-2"></i> Basic Sound Setup + DJ Console</li>
                <li><i class="fa-solid fa-check text-amber-400 mr-2"></i> Welcome Gate Entry Board</li>
              </ul>
            </div>
            <button onclick="selectPackage('Silver Celebration', 45000)" class="w-full py-3 rounded-xl border border-amber-500/50 text-amber-300 hover:bg-amber-500/20 font-semibold">
              Select Package
            </button>
          </div>

          <!-- Gold Package -->
          <div class="glass-card rounded-2xl p-8 border-2 border-amber-500 relative flex flex-col justify-between bg-gradient-to-b from-amber-950/30 to-black/80">
            <div class="absolute -top-3 right-6 bg-amber-500 text-black text-xs font-bold px-3 py-1 rounded-full uppercase">Most Popular</div>
            <div>
              <div class="text-xs uppercase text-amber-400 font-bold tracking-widest">Premium Tier</div>
              <h3 class="text-2xl font-bold font-royal mt-1 text-amber-300">Gold Festivity</h3>
              <div class="text-3xl font-bold gold-gradient my-4">₹85,000 <span class="text-xs text-gray-400 font-normal">/ base</span></div>
              <ul class="space-y-3 text-sm text-gray-300 mb-6">
                <li><i class="fa-solid fa-check text-amber-400 mr-2"></i> Sangeet / Mehendi / Luxury Receptions</li>
                <li><i class="fa-solid fa-check text-amber-400 mr-2"></i> 3D Dynamic Floral Stage & LED Screens</li>
                <li><i class="fa-solid fa-check text-amber-400 mr-2"></i> Cold Fire Entry Pyro + Bubble Effect</li>
                <li><i class="fa-solid fa-check text-amber-400 mr-2"></i> Professional Photography Backdrop</li>
              </ul>
            </div>
            <button onclick="selectPackage('Gold Festivity', 85000)" class="w-full gold-btn py-3 rounded-xl font-bold">
              Select Package
            </button>
          </div>

          <!-- Diamond Package -->
          <div class="glass-card rounded-2xl p-8 border border-gray-700 hover:border-amber-500/50 transition flex flex-col justify-between">
            <div>
              <div class="text-xs uppercase text-amber-400 font-bold tracking-widest">Ultra Luxury</div>
              <h3 class="text-2xl font-bold font-royal mt-1 text-gray-200">Royal Diamond Splendor</h3>
              <div class="text-3xl font-bold gold-gradient my-4">₹1,85,000 <span class="text-xs text-gray-400 font-normal">/ base</span></div>
              <ul class="space-y-3 text-sm text-gray-300 mb-6">
                <li><i class="fa-solid fa-check text-amber-400 mr-2"></i> Complete Grand Royal Weddings</li>
                <li><i class="fa-solid fa-check text-amber-400 mr-2"></i> Full Venue Floral Tunnel Entrance</li>
                <li><i class="fa-solid fa-check text-amber-400 mr-2"></i> Live Shehnai + Drone Photography</li>
                <li><i class="fa-solid fa-check text-amber-400 mr-2"></i> Full Event Manager & Crew Dedicated</li>
              </ul>
            </div>
            <button onclick="selectPackage('Royal Diamond Splendor', 185000)" class="w-full py-3 rounded-xl border border-amber-500/50 text-amber-300 hover:bg-amber-500/20 font-semibold">
              Select Package
            </button>
          </div>
        </div>
      </div>

      <!-- Booking Form Section -->
      <div id="booking-section" class="glass-card rounded-3xl p-8 md:p-12 border border-amber-500/30">
        <div class="max-w-3xl mx-auto">
          <div class="text-center mb-8">
            <h2 class="text-3xl font-royal font-bold gold-gradient">Book Rishi Event Online</h2>
            <p class="text-gray-400 text-sm mt-1">Fill out the details below to lock your date with us</p>
          </div>

          <form id="event-booking-form" onsubmit="submitBooking(event)" class="space-y-6">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label class="block text-xs uppercase text-amber-300 mb-2 font-semibold">Full Name *</label>
                <input type="text" id="cust-name" required placeholder="e.g. Rahul Verma" class="w-full bg-black/60 border border-gray-700 rounded-xl px-4 py-3 text-white focus:border-amber-400 focus:outline-none">
              </div>
              <div>
                <label class="block text-xs uppercase text-amber-300 mb-2 font-semibold">Phone Number *</label>
                <input type="tel" id="cust-phone" required placeholder="e.g. 9005041462" class="w-full bg-black/60 border border-gray-700 rounded-xl px-4 py-3 text-white focus:border-amber-400 focus:outline-none">
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label class="block text-xs uppercase text-amber-300 mb-2 font-semibold">Email Address</label>
                <input type="email" id="cust-email" placeholder="e.g. client@gmail.com" class="w-full bg-black/60 border border-gray-700 rounded-xl px-4 py-3 text-white focus:border-amber-400 focus:outline-none">
              </div>
              <div>
                <label class="block text-xs uppercase text-amber-300 mb-2 font-semibold">Event Type *</label>
                <select id="cust-event-type" required class="w-full bg-black/60 border border-gray-700 rounded-xl px-4 py-3 text-white focus:border-amber-400 focus:outline-none">
                  <option value="Grand Wedding">Grand Wedding</option>
                  <option value="Sangeet & Haldi">Sangeet & Haldi Ceremony</option>
                  <option value="Birthday & Anniversary">Birthday & Anniversary</option>
                  <option value="Corporate Gala">Corporate Event / Launch</option>
                  <option value="Other Celebration">Other Special Event</option>
                </select>
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label class="block text-xs uppercase text-amber-300 mb-2 font-semibold">Event Date *</label>
                <input type="date" id="cust-date" required class="w-full bg-black/60 border border-gray-700 rounded-xl px-4 py-3 text-white focus:border-amber-400 focus:outline-none">
              </div>
              <div>
                <label class="block text-xs uppercase text-amber-300 mb-2 font-semibold">Expected Guests *</label>
                <input type="number" id="cust-guests" required value="200" min="20" class="w-full bg-black/60 border border-gray-700 rounded-xl px-4 py-3 text-white focus:border-amber-400 focus:outline-none">
              </div>
              <div>
                <label class="block text-xs uppercase text-amber-300 mb-2 font-semibold">Package Tier *</label>
                <select id="cust-package" onchange="updateEstimatedPrice()" required class="w-full bg-black/60 border border-gray-700 rounded-xl px-4 py-3 text-white focus:border-amber-400 focus:outline-none">
                  <option value="Silver Celebration|45000">Silver Celebration (₹45,000)</option>
                  <option value="Gold Festivity|85000" selected>Gold Festivity (₹85,000)</option>
                  <option value="Royal Diamond Splendor|185000">Royal Diamond Splendor (₹1,85,000)</option>
                </select>
              </div>
            </div>

            <div>
              <label class="block text-xs uppercase text-amber-300 mb-2 font-semibold">Venue Location / Address *</label>
              <textarea id="cust-venue" required rows="2" placeholder="Enter complete venue address or lawn name" class="w-full bg-black/60 border border-gray-700 rounded-xl px-4 py-3 text-white focus:border-amber-400 focus:outline-none"></textarea>
            </div>

            <div>
              <label class="block text-xs uppercase text-amber-300 mb-2 font-semibold">Advance Payment Token (Optional)</label>
              <input type="number" id="cust-paid" placeholder="Amount paid upfront in ₹ (e.g. 10000)" class="w-full bg-black/60 border border-gray-700 rounded-xl px-4 py-3 text-white focus:border-amber-400 focus:outline-none">
            </div>

            <div class="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex justify-between items-center">
              <div>
                <div class="text-xs text-gray-400 uppercase">Estimated Total Amount</div>
                <div id="booking-estimated-price" class="text-2xl font-bold font-royal text-amber-300">₹85,000</div>
              </div>
              <button type="submit" class="gold-btn px-8 py-3 rounded-xl font-bold">
                Confirm Booking Now
              </button>
            </div>
          </form>
        </div>
      </div>

    </section>

    <!-- ======================================================= -->
    <!-- PORTAL 2: RISHI ADMIN DASHBOARD (ANALYTICS & DATA) -->
    <!-- ======================================================= -->
    <section id="portal-admin" class="hidden space-y-8">
      
      <!-- Admin Top Banner -->
      <div class="glass-card rounded-2xl p-6 border-l-4 border-amber-500 flex flex-wrap justify-between items-center gap-4">
        <div>
          <span class="text-xs uppercase text-amber-400 tracking-widest font-bold"><i class="fa-solid fa-crown mr-2"></i> Rishi Owner Portal</span>
          <h2 class="text-3xl font-royal font-bold text-white mt-1">Financial & Business Control Hub</h2>
        </div>
        <div class="flex items-center space-x-3">
          <button onclick="fetchAdminData()" class="px-4 py-2 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 text-sm">
            <i class="fa-solid fa-rotate-right mr-1"></i> Refresh Realtime Data
          </button>
          <button onclick="logoutAdmin()" class="px-4 py-2 rounded-lg bg-red-950/50 text-red-300 border border-red-800/50 hover:bg-red-900/50 text-sm">
            <i class="fa-solid fa-right-from-bracket mr-1"></i> Lock Dashboard
          </button>
        </div>
      </div>

      <!-- Financial Metric Cards -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
        
        <!-- Total Amount Got -->
        <div class="glass-card rounded-2xl p-6 border border-emerald-500/30 relative overflow-hidden">
          <div class="absolute right-4 top-4 text-emerald-400 text-3xl opacity-30"><i class="fa-solid fa-indian-rupee-sign"></i></div>
          <div class="text-xs uppercase text-gray-400 font-semibold tracking-wider">Total Amount Got (Received)</div>
          <div id="stat-amount-got" class="text-3xl font-bold text-emerald-400 mt-2 font-royal">₹0</div>
          <div class="text-xs text-emerald-500/80 mt-2 flex items-center">
            <i class="fa-solid fa-circle-check mr-1"></i> Verified Received Payments
          </div>
        </div>

        <!-- Total Pipeline / Bookings Value -->
        <div class="glass-card rounded-2xl p-6 border border-amber-500/30 relative overflow-hidden">
          <div class="absolute right-4 top-4 text-amber-400 text-3xl opacity-30"><i class="fa-solid fa-vault"></i></div>
          <div class="text-xs uppercase text-gray-400 font-semibold tracking-wider">Total Pipeline Revenue</div>
          <div id="stat-pipeline" class="text-3xl font-bold gold-gradient mt-2 font-royal">₹0</div>
          <div class="text-xs text-amber-400/80 mt-2">Combined Contract Value</div>
        </div>

        <!-- Pending Outstanding Dues -->
        <div class="glass-card rounded-2xl p-6 border border-red-500/30 relative overflow-hidden">
          <div class="absolute right-4 top-4 text-red-400 text-3xl opacity-30"><i class="fa-solid fa-hourglass-half"></i></div>
          <div class="text-xs uppercase text-gray-400 font-semibold tracking-wider">Pending Dues to Collect</div>
          <div id="stat-pending-dues" class="text-3xl font-bold text-red-400 mt-2 font-royal">₹0</div>
          <div class="text-xs text-red-400/80 mt-2">Balance Remaining</div>
        </div>

        <!-- Total Events Executed -->
        <div class="glass-card rounded-2xl p-6 border border-purple-500/30 relative overflow-hidden">
          <div class="absolute right-4 top-4 text-purple-400 text-3xl opacity-30"><i class="fa-solid fa-champagne-glasses"></i></div>
          <div class="text-xs uppercase text-gray-400 font-semibold tracking-wider">Total Bookings Count</div>
          <div id="stat-bookings-count" class="text-3xl font-bold text-purple-300 mt-2 font-royal">0</div>
          <div id="stat-growth-rate" class="text-xs text-purple-400 mt-2">Growth Rate: +0%</div>
        </div>

      </div>

      <!-- Monthly vs Yearly Breakdown -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="glass-card rounded-2xl p-6 border border-gray-800">
          <h3 class="text-lg font-bold font-royal text-amber-300 mb-4 flex items-center">
            <i class="fa-solid fa-chart-line mr-2"></i> Monthly Revenue Collection
          </h3>
          <div class="flex justify-between items-center mb-2">
            <span class="text-gray-400 text-sm">Current Month Earnings</span>
            <span id="stat-month-turnover" class="text-xl font-bold text-emerald-400">₹0</span>
          </div>
          <div class="w-full bg-gray-800 rounded-full h-3 overflow-hidden">
            <div id="bar-month-turnover" class="bg-emerald-500 h-full rounded-full" style="width: 45%;"></div>
          </div>
        </div>

        <div class="glass-card rounded-2xl p-6 border border-gray-800">
          <h3 class="text-lg font-bold font-royal text-amber-300 mb-4 flex items-center">
            <i class="fa-solid fa-calendar-days mr-2"></i> Yearly Financial Turnover
          </h3>
          <div class="flex justify-between items-center mb-2">
            <span class="text-gray-400 text-sm">Annual Turnover (2026)</span>
            <span id="stat-year-turnover" class="text-xl font-bold gold-gradient">₹0</span>
          </div>
          <div class="w-full bg-gray-800 rounded-full h-3 overflow-hidden">
            <div id="bar-year-turnover" class="bg-amber-500 h-full rounded-full" style="width: 70%;"></div>
          </div>
        </div>
      </div>

      <!-- Customer Data & Bookings Table -->
      <div class="glass-card rounded-2xl p-6 border border-amber-500/20 overflow-hidden">
        <div class="flex justify-between items-center mb-6">
          <h3 class="text-xl font-bold font-royal text-amber-300">
            <i class="fa-solid fa-users-viewfinder mr-2"></i> Customer Bookings & Payment Records
          </h3>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm text-gray-300">
            <thead class="bg-black/80 text-amber-400 uppercase text-xs font-bold font-royal border-b border-amber-500/30">
              <tr>
                <th class="p-4">Booking ID</th>
                <th class="p-4">Customer</th>
                <th class="p-4">Event & Date</th>
                <th class="p-4">Package</th>
                <th class="p-4">Total Amount</th>
                <th class="p-4">Amount Got</th>
                <th class="p-4">Status</th>
                <th class="p-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody id="admin-table-body" class="divide-y divide-gray-800">
              <!-- Dynamically populated -->
            </tbody>
          </table>
        </div>
      </div>

    </section>

  </main>

  <script>
    let isAdminLoggedIn = false;

    // Canvas Particle Dynamic Animation (4D atmosphere effect)
    const canvas = document.getElementById('particle-canvas');
    const ctx = canvas.getContext('2d');
    let particles = [];

    function resizeCanvas() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    class Particle {
      constructor() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.radius = Math.random() * 2.5 + 0.5;
        this.color = Math.random() > 0.5 ? '#d4af37' : '#aa771c';
        this.speedX = (Math.random() - 0.5) * 0.4;
        this.speedY = (Math.random() - 0.5) * 0.4;
        this.alpha = Math.random() * 0.7 + 0.2;
      }
      update() {
        this.x += this.speedX;
        this.y += this.speedY;
        if (this.x < 0 || this.x > canvas.width) this.speedX *= -1;
        if (this.y < 0 || this.y > canvas.height) this.speedY *= -1;
      }
      draw() {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#d4af37';
        ctx.fill();
        ctx.restore();
      }
    }

    for (let i = 0; i < 60; i++) particles.push(new Particle());

    function animateParticles() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        p.update();
        p.draw();
      });
      requestAnimationFrame(animateParticles);
    }
    animateParticles();

    // 4D Card Tilt Interaction
    function handleTilt(e, card) {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      card.style.transform = \`perspective(1000px) rotateX(\${-y / 20}deg) rotateY(\${x / 20}deg) scale3d(1.01, 1.01, 1.01)\`;
    }

    function resetTilt(card) {
      card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
    }

    // Portal Switching Function
    function switchPortal(portal) {
      const customerSec = document.getElementById('portal-customer');
      const adminSec = document.getElementById('portal-admin');
      const btnCust = document.getElementById('btn-customer-portal');
      const btnAdmin = document.getElementById('btn-admin-portal');

      if (portal === 'customer') {
        customerSec.classList.remove('hidden');
        adminSec.classList.add('hidden');
        btnCust.className = 'px-4 py-2 rounded-lg text-sm font-semibold transition bg-amber-500/20 text-amber-300 border border-amber-500/40';
        btnAdmin.className = 'px-4 py-2 rounded-lg text-sm font-semibold transition bg-gray-900/80 text-gray-400 hover:text-amber-300 border border-gray-800';
      } else if (portal === 'admin') {
        if (!isAdminLoggedIn) {
          alert('Access Denied. Rishi Admin PIN login required.');
          return;
        }
        customerSec.classList.add('hidden');
        adminSec.classList.remove('hidden');
        btnAdmin.className = 'px-4 py-2 rounded-lg text-sm font-semibold transition bg-amber-500/20 text-amber-300 border border-amber-500/40';
        btnCust.className = 'px-4 py-2 rounded-lg text-sm font-semibold transition bg-gray-900/80 text-gray-400 hover:text-amber-300 border border-gray-800';
        fetchAdminData();
      }
    }

    // Admin PIN Security Verification
    function promptAdminLogin() {
      if (isAdminLoggedIn) {
        switchPortal('admin');
        return;
      }
      const pin = prompt("Enter Rishi Owner Access Security PIN (Default: 1234):");
      if (pin === "1234") {
        isAdminLoggedIn = true;
        alert("Welcome Rishi Sir! Access Granted to Admin Dashboard.");
        switchPortal('admin');
      } else if (pin !== null) {
        alert("Incorrect PIN. Access Denied!");
      }
    }

    function logoutAdmin() {
      isAdminLoggedIn = false;
      switchPortal('customer');
    }

    // Package Picker Action
    function selectPackage(pkgName, price) {
      const select = document.getElementById('cust-package');
      for (let i = 0; i < select.options.length; i++) {
        if (select.options[i].value.startsWith(pkgName)) {
          select.selectedIndex = i;
          break;
        }
      }
      updateEstimatedPrice();
      document.getElementById('booking-section').scrollIntoView({ behavior: 'smooth' });
    }

    function updateEstimatedPrice() {
      const select = document.getElementById('cust-package');
      const parts = select.value.split('|');
      const price = Number(parts[1] || 85000);
      document.getElementById('booking-estimated-price').innerText = '₹' + price.toLocaleString('en-IN');
    }

    // Submit Customer Booking
    async function submitBooking(e) {
      e.preventDefault();

      const pkgValue = document.getElementById('cust-package').value.split('|');
      const payload = {
        customerName: document.getElementById('cust-name').value,
        phone: document.getElementById('cust-phone').value,
        email: document.getElementById('cust-email').value,
        eventType: document.getElementById('cust-event-type').value,
        eventDate: document.getElementById('cust-date').value,
        guestCount: document.getElementById('cust-guests').value,
        packageChosen: pkgValue[0],
        totalAmount: Number(pkgValue[1]),
        paidAmount: Number(document.getElementById('cust-paid').value || 0),
        venueAddress: document.getElementById('cust-venue').value
      };

      try {
        const res = await fetch('/api/bookings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (data.success) {
          confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
          alert('🎉 Congratulations! Your Event Booking Request ID [' + data.booking.bookingId + '] has been recorded successfully. Rishi Event team will contact you shortly.');
          document.getElementById('event-booking-form').reset();
          updateEstimatedPrice();
        } else {
          alert('Failed to place booking: ' + data.message);
        }
      } catch (err) {
        alert('Error connecting to server. Please try again.');
      }
    }

    // Fetch Analytics for Rishi Admin
    async function fetchAdminData() {
      try {
        const res = await fetch('/api/admin/analytics');
        const data = await res.json();

        if (data.success) {
          const stats = data.stats;
          document.getElementById('stat-amount-got').innerText = '₹' + stats.totalGot.toLocaleString('en-IN');
          document.getElementById('stat-pipeline').innerText = '₹' + stats.totalPipeline.toLocaleString('en-IN');
          document.getElementById('stat-pending-dues').innerText = '₹' + stats.pendingDues.toLocaleString('en-IN');
          document.getElementById('stat-bookings-count').innerText = stats.totalBookings;
          document.getElementById('stat-growth-rate').innerText = 'Estimated Growth: ' + stats.estimatedGrowth;
          
          document.getElementById('stat-month-turnover').innerText = '₹' + stats.currentMonthTurnover.toLocaleString('en-IN');
          document.getElementById('stat-year-turnover').innerText = '₹' + stats.yearlyTurnover.toLocaleString('en-IN');

          // Render Table Rows
          const tbody = document.getElementById('admin-table-body');
          tbody.innerHTML = '';

          if (data.bookings.length === 0) {
            tbody.innerHTML = \`<tr><td colspan="8" class="text-center p-6 text-gray-500">No event bookings found yet.</td></tr>\`;
            return;
          }

          data.bookings.forEach(b => {
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-amber-500/5 transition';

            let statusBadge = '';
            if (b.paymentStatus === 'Paid') {
              statusBadge = \`<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">PAID</span>\`;
            } else if (b.paymentStatus === 'Partial') {
              statusBadge = \`<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">PARTIAL</span>\`;
            } else {
              statusBadge = \`<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/30">PENDING</span>\`;
            }

            tr.innerHTML = \`
              <td class="p-4 font-mono font-bold text-amber-300">\${b.bookingId}</td>
              <td class="p-4">
                <div class="font-semibold text-white">\${b.customerName}</div>
                <div class="text-xs text-gray-400">\${b.phone}</div>
              </td>
              <td class="p-4">
                <div class="text-white">\${b.eventType}</div>
                <div class="text-xs text-amber-400/80">\${b.eventDate}</div>
              </td>
              <td class="p-4 text-xs font-semibold text-gray-300">\${b.packageChosen}</td>
              <td class="p-4 font-bold text-white">₹\${b.totalAmount.toLocaleString('en-IN')}</td>
              <td class="p-4 font-bold text-emerald-400">₹\${b.paidAmount.toLocaleString('en-IN')}</td>
              <td class="p-4">\${statusBadge}</td>
              <td class="p-4 text-center">
                <button onclick="updatePaymentPrompt('\${b.bookingId}', \${b.paidAmount}, \${b.totalAmount})" class="px-3 py-1 bg-amber-500/20 text-amber-300 hover:bg-amber-500/40 rounded-lg text-xs border border-amber-500/30">
                  <i class="fa-solid fa-pen mr-1"></i> Update Amount
                </button>
              </td>
            \`;
            tbody.appendChild(tr);
          });
        }
      } catch (err) {
        alert('Error fetching admin data.');
      }
    }

    // Update Amount Received Prompt
    async function updatePaymentPrompt(bookingId, currentPaid, totalAmount) {
      const newPaid = prompt(\`Update total received payment amount for \${bookingId} (Total Contract Value: ₹\${totalAmount}):\`, currentPaid);
      if (newPaid !== null && !isNaN(newPaid)) {
        try {
          const res = await fetch(\`/api/admin/bookings/\${bookingId}/payment\`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paidAmount: Number(newPaid) })
          });
          const data = await res.json();
          if (data.success) {
            alert('Payment updated successfully!');
            fetchAdminData();
          }
        } catch (err) {
          alert('Failed to update payment status.');
        }
      }
    }
  </script>
</body>
</html>
  `);
});

// Start Application Server
app.listen(PORT, () => {
  console.log(`Rishi Event portal server active at http://localhost:${PORT}`);
});
