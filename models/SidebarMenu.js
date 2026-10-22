const mongoose = require('mongoose');

const sidebarMenuSchema = new mongoose.Schema({
    label: { type: String, default: '' },
    url: { type: String, default: '' },
    isActive: { type: Boolean, default: false },
    dynamicActive: { type: Boolean, default: true },
    order: { type: Number, default: 0 }
});

module.exports = mongoose.model('SidebarMenu', sidebarMenuSchema);
