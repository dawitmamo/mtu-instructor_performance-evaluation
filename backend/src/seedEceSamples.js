import { connectDb, disconnectDb } from './config/db.js';
import { seedEceSampleData } from './services/eceSampleData.js';

await connectDb();
const summary = await seedEceSampleData();
console.log(`ECE sample data synced: ${JSON.stringify(summary)}`);
await disconnectDb();
