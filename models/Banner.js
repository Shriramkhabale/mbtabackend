const mongoose = require('mongoose');

const bannerSchema = new mongoose.Schema({
    img: { type: String, required: true },
    alt: { type: String, default: 'Banner' },
    fallbackIcon: { type: String, default: '' },
    fallbackPerson: { type: String, default: '' }
});

module.exports = mongoose.model('Banner', bannerSchema);
