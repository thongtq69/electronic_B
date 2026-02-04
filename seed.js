require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

const seedAdmin = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const existingAdmin = await User.findOne({ username: 'admin' });
        if (existingAdmin) {
            console.log('Admin account already exists.');
        } else {
            const admin = new User({
                username: 'admin',
                password: 'adminpassword123', // Khuyến cáo đổi ngay sau khi đăng nhập
                role: 'admin'
            });
            await admin.save();
            console.log('Admin account created successfully!');
            console.log('Username: admin');
            console.log('Password: adminpassword123');
        }
        process.exit(0);
    } catch (err) {
        console.error('Error seeding admin:', err);
        process.exit(1);
    }
};

seedAdmin();
