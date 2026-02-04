const mongoose = require('mongoose');

const CalculationSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    customerName: { type: String, default: 'Chưa có tên' },
    customerCode: { type: String },
    totalDungGia: { type: Number },
    totalDaTinh: { type: Number },
    diff: { type: Number },
    details: { type: mongoose.Schema.Types.Mixed }, // Store the whole result object
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Calculation', CalculationSchema);
