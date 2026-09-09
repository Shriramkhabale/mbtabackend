const mongoose = require('mongoose');

const newsImageSchema = new mongoose.Schema({
    img: { type: String, required: true },
});

module.exports = mongoose.model('NewsImage', newsImageSchema);
