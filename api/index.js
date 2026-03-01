require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Calculation = require('../models/Calculation');
const PriceConfig = require('../models/PriceConfig');
const { auth, adminOnly } = require('../middleware/auth');

const app = express();
app.use(express.json());
app.use(cors());

const PRICE_PERIODS = {
    before_05_2025: { id: 'before_05_2025', name: 'Trước tháng 5/2025', shortName: 'Trước 5/2025' },
    from_05_2025: { id: 'from_05_2025', name: 'Hiện tại', shortName: 'Hiện tại' }
};

const DEFAULT_PRICES = {
    before_05_2025: {
        tier1: 1984,
        tier2: 2050,
        tier3: 2380,
        tier4: 2998,
        tier5: 3350,
        tier6: 3460,
        production: 1987,
        business: 3152,
        hcsn_hospital: 2072,
        hcsn_lighting: 2226,
        vat: 0.08
    },
    from_05_2025: {
        tier1: 1984,
        tier2: 2050,
        tier3: 2380,
        tier4: 2998,
        tier5: 3350,
        tier6: 3460,
        production: 1987,
        business: 3152,
        hcsn_hospital: 2072,
        hcsn_lighting: 2226,
        vat: 0.08
    }
};

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
            apiVersion: '2026-03-02.1',
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

app.get('/api/prices', async (req, res) => {
    try {
        await connectDB();
        const cfg = await PriceConfig.findOne({ key: 'default' }).lean();
        if (cfg) {
            return res.json({
                periods: cfg.periods,
                prices: cfg.prices,
                currentPeriod: cfg.currentPeriod
            });
        }
    } catch (error) {
        console.error('Price config fetch error:', error);
    }

    res.json({
        periods: PRICE_PERIODS,
        prices: DEFAULT_PRICES,
        currentPeriod: 'from_05_2025'
    });
});

app.put('/api/prices', [auth, adminOnly], async (req, res) => {
    await connectDB();
    const { periods, prices, currentPeriod } = req.body;

    if (!periods || !prices || !currentPeriod) {
        return res.status(400).json({ error: 'Thiếu dữ liệu bảng giá cần lưu' });
    }

    const updated = await PriceConfig.findOneAndUpdate(
        { key: 'default' },
        {
            key: 'default',
            periods,
            prices,
            currentPeriod,
            updatedBy: req.user._id,
            updatedAt: new Date()
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({
        message: 'Đã lưu bảng giá điện',
        currentPeriod: updated.currentPeriod
    });
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

// AI Proxy to bypass CORS
const AI_API_KEY = process.env.AI_API_KEY;
const AI_ENDPOINT = "https://opencode.ai/zen/v1/chat/completions";

function fallbackLegalResponse(query) {
    const q = (query || '').toLowerCase();

    if (q.includes('giá điện') || q.includes('gia dien') || q.includes('bậc') || q.includes('bac')) {
        return 'Theo biểu giá hiện hành đang cấu hình trong hệ thống: SH bậc 1-6 lần lượt 1,984 / 2,050 / 2,380 / 2,998 / 3,350 / 3,460 đ/kWh; SXBT 1,987 đ/kWh; KDDV 3,152 đ/kWh; HCSN(BV) 2,072 đ/kWh; HCSN(CS) 2,226 đ/kWh; VAT 8%. Bạn nên đối chiếu văn bản gốc: QĐ 1279/QĐ-BCT và TT 60/2025/TT-BCT.';
    }

    if (q.includes('xử phạt') || q.includes('xu phat') || q.includes('vi phạm') || q.includes('vi pham')) {
        return 'Nội dung liên quan xử phạt vi phạm hành chính trong điện lực thuộc Nghị định 17/2022/NĐ-CP (sửa đổi, bổ sung). Bạn nên nêu rõ hành vi cụ thể để tra cứu đúng điều, khoản và mức phạt.';
    }

    if (q.includes('kiểm tra') || q.includes('kiem tra') || q.includes('tranh chấp') || q.includes('tranh chap')) {
        return 'Nội dung kiểm tra hoạt động điện lực và giải quyết tranh chấp hợp đồng mua bán điện thuộc Thông tư 42/2022/TT-BCT. Bạn có thể cung cấp tình huống cụ thể để mình trích dẫn theo điều khoản phù hợp.';
    }

    return 'Hiện hệ thống AI chưa sẵn sàng nên đang trả lời ở chế độ dự phòng. Các văn bản chính đang hỗ trợ: Luật Điện lực 2024, TT 60/2025/TT-BCT, QĐ 1279/QĐ-BCT, TT 42/2022/TT-BCT, NĐ 17/2022/NĐ-CP.';
}

app.post('/api/ai/search', async (req, res) => {
    const { query, model = 'kimi-k2.5-free' } = req.body;

    if (!AI_API_KEY) {
        return res.json({
            content: fallbackLegalResponse(query),
            fallback: true,
            reason: 'missing_ai_key'
        });
    }

    try {
        const fetch = (await import('node-fetch')).default;
        const response = await fetch(AI_ENDPOINT, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${AI_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    {
                        role: "system",
                        content: `Bạn là trợ lý pháp lý chuyên nghiệp về lĩnh vực Điện lực tại Việt Nam. 
                        Bạn có kiến thức về các văn bản sau:
                        1. Luật Điện lực 2024 (61/2024/QH15) - Hiệu lực từ 01/02/2025.
                        2. Thông tư 60/2025/TT-BCT - Quy định về giá bán điện 2025.
                        3. Quyết định 1279/QĐ-BCT - Biểu giá bán lẻ điện 2025.
                        4. Thông tư 42/2022/TT-BCT - Kiểm tra hoạt động điện lực.
                        5. Nghị định 17/2022/NĐ-CP - Xử phạt vi phạm hành chính điện lực.
                        
                        Hãy trả lời ngắn gọn, chính xác và trích dẫn văn bản phù hợp. 
                        Nếu không biết chắc chắn, hãy yêu cầu người dùng kiểm tra lại văn bản gốc.`
                    },
                    { role: "user", content: query }
                ],
                temperature: 0.7
            })
        });

        const data = await response.json();

        if (response.ok && data.choices && data.choices[0]) {
            res.json({ content: data.choices[0].message.content });
        } else {
            res.json({
                content: fallbackLegalResponse(query),
                fallback: true,
                reason: 'upstream_error',
                details: data
            });
        }
    } catch (error) {
        console.error('AI Proxy Error:', error);
        res.json({
            content: fallbackLegalResponse(query),
            fallback: true,
            reason: 'network_error',
            message: error.message
        });
    }
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
