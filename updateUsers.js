require('dotenv').config();
const connectDB = require('./db');
const User = require('./models/User');

const updateUsers = async () => {
  await connectDB();
  const users = await User.find({ retailerId: { $exists: false } });
  for (let user of users) {
    user.retailerId = 'MBM' + Math.floor(100000 + Math.random() * 900000);
    await user.save();
    console.log('Updated ' + user.userId + ' with retailerId ' + user.retailerId);
  }
  process.exit(0);
};

updateUsers().catch(err => {
  console.error(err);
  process.exit(1);
});
