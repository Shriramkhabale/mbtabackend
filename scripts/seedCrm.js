require('dotenv').config();
const mongoose = require('mongoose');
const SidebarMenu = require('../models/SidebarMenu');
const CrmCard = require('../models/CrmCard');

async function run() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/mbta');
  console.log('Connected to DB');

  // 1. Check SidebarMenu for CRM
  let crmMenu = await SidebarMenu.findOne({
    $or: [{ url: '/crm' }, { label: /^crm$/i }]
  });

  if (!crmMenu) {
    const maxOrder = await SidebarMenu.find().sort({ order: -1 }).limit(1);
    const newOrder = (maxOrder && maxOrder[0] && typeof maxOrder[0].order === 'number') ? maxOrder[0].order + 1 : 7;
    crmMenu = new SidebarMenu({
      label: 'CRM',
      url: '/crm',
      isActive: true,
      dynamicActive: true,
      order: newOrder
    });
    await crmMenu.save();
    console.log('Created CRM SidebarMenu:', crmMenu);
  } else {
    crmMenu.label = 'CRM';
    crmMenu.url = '/crm';
    crmMenu.isActive = true;
    await crmMenu.save();
    console.log('CRM SidebarMenu updated & active:', crmMenu);
  }

  // 2. Check and seed CrmCard
  const count = await CrmCard.countDocuments();
  console.log('Current CrmCard count:', count);
  if (count === 0) {
    const DEFAULT_CRM_CARDS = [
      {
        cardId: 'task',
        title: 'Task',
        subtitle: 'Organize daily to-dos, assignments, and follow-ups.',
        icon: '📋',
        badge: 'Tasks',
        color: '#3b82f6',
        url: '/crm/task',
        isActive: true,
        order: 0
      },
      {
        cardId: 'pending_work',
        title: 'Pending Work',
        subtitle: 'Monitor, track, and clear customer pending applications.',
        icon: '⏳',
        badge: 'Pending',
        color: '#f59e0b',
        url: '/crm/pending-work',
        isActive: true,
        order: 1
      },
      {
        cardId: 'my_bill_book',
        title: 'My Bill Book',
        subtitle: 'Digital billing, invoice records, and ledger management.',
        icon: '📖',
        badge: 'Billing',
        color: '#10b981',
        url: '/crm/my-bill-book',
        isActive: true,
        order: 2
      },
      {
        cardId: 'customer_management',
        title: 'Customer Management',
        subtitle: 'Customer directory, contact details, and client profiles.',
        icon: '👥',
        badge: 'Clients',
        color: '#8b5cf6',
        url: '/crm/customer-management',
        isActive: true,
        order: 3
      }
    ];
    await CrmCard.insertMany(DEFAULT_CRM_CARDS);
    console.log('Seeded 4 default CRM cards successfully');
  }

  const allCards = await CrmCard.find().sort({ order: 1 });
  console.log('All CRM Cards in DB:', allCards.map(c => ({ id: c.cardId, title: c.title, active: c.isActive })));

  const allMenus = await SidebarMenu.find().sort({ order: 1 });
  console.log('All SidebarMenus in DB:', allMenus.map(m => ({ label: m.label, url: m.url, active: m.isActive })));

  await mongoose.disconnect();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
