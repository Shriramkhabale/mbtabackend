const mongoose = require('mongoose');
const siteSettingsSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: String, default: '' },
  updatedAt: { type: Date, default: Date.now }
});
module.exports = mongoose.model('SiteSettings', siteSettingsSchema);
