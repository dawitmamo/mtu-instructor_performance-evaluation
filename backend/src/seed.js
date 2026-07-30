import { connectDb, disconnectDb } from './config/db.js';
import { seedDemoData } from './services/demoData.js';

await connectDb();
await seedDemoData({ reset: true });
console.log('Seed data created. Super Admin: admin@mtu.edu.et / admin12345. Other sample accounts: Password123!');
await disconnectDb();
