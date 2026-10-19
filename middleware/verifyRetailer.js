const User = require('../models/User');
const { verifySessionToken } = require('../utils/sessionToken');

const verifyRetailer = async (req, res, next) => {
  const authorization = req.get('authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  const session = match && verifySessionToken(match[1]);

  if (!session) {
    return res.status(401).json({ success: false, message: 'Please log in again to continue.' });
  }

  try {
    const retailer = await User.findOne({
      userId: session.userId,
      role: 'retailer',
      status: 'Approved'
    }).select('userId role');

    if (!retailer) {
      return res.status(403).json({ success: false, message: 'An approved retailer account is required.' });
    }

    req.retailer = retailer;
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = verifyRetailer;
