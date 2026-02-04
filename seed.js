require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function seedAdmin() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB...');

        const adminExists = await User.findOne({ role: 'admin' });
        if (adminExists) {
            console.log('Admin user already exists:', adminExists.username);
        } else {
            const admin = new User({
                username: 'admin',
                password: 'adminpassword123',
                role: 'admin'
            });
            await admin.save();
            console.log('Initial admin user created successfully!');
            console.log('Username: admin');
            console.log('Password: adminpassword123');
        }
    } catch (err) {
        console.error('Error seeding admin:', err);
    } finally {
        mongoose.disconnect();
    }
}

seedAdmin();
