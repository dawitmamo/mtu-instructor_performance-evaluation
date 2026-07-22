import { connectDb, disconnectDb } from './config/db.js';
import { seedDemoPeerAssignments, seedEvaluationTemplates } from './services/demoData.js';

await connectDb();
await seedEvaluationTemplates();
await seedDemoPeerAssignments();
console.log('Evaluation templates and demo peer tasks synced.');
await disconnectDb();
