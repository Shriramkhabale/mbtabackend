require('dotenv').config();
const connectDB = require('./db');
const User = require('./models/User');
const PaymentRequisition = require('./models/PaymentRequisition');

const fixWallets = async () => {
  await connectDB();
  const reqs = await PaymentRequisition.find({ status: { $in: ['Approved', 'Partially Approved'] } });
  for (let r of reqs) {
    const u = await User.findOne({ userId: r.userId });
    if (u && u.walletBalance === 0) {
      u.walletBalance += r.approvedAmount;
      await u.save();
      console.log('Fixed wallet for ' + u.userId + ' with amount ' + r.approvedAmount);
    }
  }
  process.exit(0);
};

fixWallets().catch(err => {
  console.error(err);
  process.exit(1);
});
