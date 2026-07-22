import { connectDb, disconnectDb } from './config/db.js';
import { seedDemoData } from './services/demoData.js';

await connectDb();
await seedDemoData({ reset: true });
console.log('Seed data created. Password for all accounts: Password123!');
await disconnectDb();
