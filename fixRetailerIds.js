require('dotenv').config();
const connectDB = require('./db');
const User = require('./models/User');

const fixRetailerIds = async () => {
  await connectDB();
  const users = await User.find({ $or: [{ retailerId: { $exists: false } }, { retailerId: '' }, { retailerId: null }] });
  
  for (let u of users) {
    const randomNum = Math.floor(100000 + Math.random() * 900000);
    u.retailerId = 'MBM' + randomNum;
    await u.save();
    console.log(`Generated retailerId ${u.retailerId} for user ${u.userId}`);
  }
  
  process.exit(0);
};

fixRetailerIds().catch(err => {
  console.error(err);
  process.exit(1);
});
