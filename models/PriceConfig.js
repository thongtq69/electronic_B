const mongoose = require('mongoose');

const PriceConfigSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true, default: 'default' },
    periods: { type: mongoose.Schema.Types.Mixed, required: true },
    prices: { type: mongoose.Schema.Types.Mixed, required: true },
    currentPeriod: { type: String, required: true, default: 'from_05_2025' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('PriceConfig', PriceConfigSchema);
