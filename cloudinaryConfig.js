const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
require('dotenv').config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Patch the timestamp to fix the "Stale request" error caused by local system clock drift
cloudinary.utils.timestamp = () => Math.round((Date.now() + 1000 * 60 * 60 * 15) / 1000);

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'samples/mb_mitra',
    // Auto-compress & auto-format every upload to reduce file size
    transformation: [{ quality: 'auto', fetch_format: 'auto' }],
  },
});

const upload = multer({ storage: storage });

module.exports = { cloudinary, upload };
