require('dotenv').config();
const connectDB = require('./db');
const User = require('./models/User');
const SidebarMenu = require('./models/SidebarMenu');
const TopTab = require('./models/TopTab');
const ActionCard = require('./models/ActionCard');

async function run() {
  await connectDB();
  console.log("USERS:");
  const users = await User.find();
  console.log(JSON.stringify(users, null, 2));

  console.log("\nSIDEBAR MENUS:");
  const menus = await SidebarMenu.find();
  console.log(JSON.stringify(menus, null, 2));

  console.log("\nTOP TABS:");
  const tabs = await TopTab.find();
  console.log(JSON.stringify(tabs, null, 2));

  console.log("\nWALLET TRANSACTIONS:");
  const WalletTransaction = require('./models/WalletTransaction');
  const wtxs = await WalletTransaction.find();
  console.log(JSON.stringify(wtxs, null, 2));

  console.log("\nPAYMENT REQUISITIONS:");
  const PaymentRequisition = require('./models/PaymentRequisition');
  const reqs = await PaymentRequisition.find().sort({ createdAt: -1 }).limit(10);
  console.log(JSON.stringify(reqs, null, 2));

  process.exit(0);
}
run();
