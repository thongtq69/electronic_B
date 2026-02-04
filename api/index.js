require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Calculation = require('../models/Calculation');
const { auth, adminOnly } = require('../middleware/auth');

const app = express();
app.use(express.json());
app.use(cors());

// MongoDB connection management
let cachedDb = null;
const connectDB = async () => {
    if (cachedDb && mongoose.connection.readyState === 1) {
        return cachedDb;
    }

    if (!process.env.MONGODB_URI) {
        throw new Error('MONGODB_URI is missing');
    }

    console.log('Connecting to MongoDB...');
    try {
        const db = await mongoose.connect(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: 5000, // Timeout sau 5s nếu không kết nối được
        });
        cachedDb = db;
        console.log('Connected to MongoDB');
        return db;
    } catch (err) {
        console.error('MongoDB connection error:', err);
        throw err;
    }
};

// Diagnostic route
app.get('/api/health', async (req, res) => {
    try {
        await connectDB();
        res.json({
            status: 'ok',
            database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
            env: {
                hasMongo: !!process.env.MONGODB_URI,
                hasJWT: !!process.env.JWT_SECRET
            }
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// Login Route
app.post('/api/auth/login', async (req, res) => {
    try {
        await connectDB();
        const { username, password } = req.body;
        console.log('Login attempt for:', username);

        if (!username || !password) {
            return res.status(400).json({ error: 'Thiếu tên đăng nhập hoặc mật khẩu' });
        }

        const user = await User.findOne({ username });
        if (!user) {
            return res.status(400).json({ error: 'Tài khoản không tồn tại' });
        }

        const validPassword = await user.comparePassword(password);
        if (!validPassword) {
            return res.status(400).json({ error: 'Mật khẩu không chính xác' });
        }

        const token = jwt.sign(
            { _id: user._id, username: user.username, role: user.role },
            process.env.JWT_SECRET || 'fallback_secret'
        );

        res.json({ token, role: user.role, username: user.username });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Lỗi hệ thống', message: err.message });
    }
});

// Admin Route: Create User
app.post('/api/admin/users', [auth, adminOnly], async (req, res) => {
    await connectDB();
    const { username, password, role } = req.body;
    try {
        const user = new User({ username, password, role });
        await user.save();
        res.json({ message: 'Tạo tài khoản thành công', username: user.username });
    } catch (err) {
        res.status(400).json({ error: 'Tên người dùng đã tồn tại hoặc dữ liệu không hợp lệ' });
    }
});

// Admin Route: List Users
app.get('/api/admin/users', [auth, adminOnly], async (req, res) => {
    await connectDB();
    const users = await User.find().select('-password');
    res.json(users);
});

// Save Calculation
app.post('/api/calculations', auth, async (req, res) => {
    await connectDB();
    const { customerName, customerCode, totalDungGia, totalDaTinh, diff, details } = req.body;
    const calc = new Calculation({
        userId: req.user._id,
        customerName,
        customerCode,
        totalDungGia,
        totalDaTinh,
        diff,
        details
    });
    await calc.save();
    res.json({ message: 'Đã lưu kết quả tính toán', _id: calc._id });
});

// Get User Calculations
app.get('/api/calculations', auth, async (req, res) => {
    await connectDB();
    const calcs = (await User.findOne({ _id: req.user._id })).role === 'admin'
        ? await Calculation.find().sort('-createdAt')
        : await Calculation.find({ userId: req.user._id }).sort('-createdAt');
    res.json(calcs);
});

// Root Route
app.get('/', (req, res) => {
    res.send('Truy Thu Dien API is running');
});

// For local testing
if (process.env.NODE_ENV !== 'production') {
    const port = process.env.PORT || 3000;
    app.listen(port, () => console.log(`Server listening on port ${port}`));
}

module.exports = app;
