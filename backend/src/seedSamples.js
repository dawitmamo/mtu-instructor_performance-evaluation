import { connectDb, disconnectDb } from './config/db.js';
import { seedEvaluationTemplates, seedSampleAcademicData } from './services/demoData.js';

await connectDb();
await seedEvaluationTemplates();
const summary = await seedSampleAcademicData();
console.log(`Sample data synced. Departments: ${summary.departments}, users: ${summary.users}, courses: ${summary.courses}, assignments: ${summary.assignments}. Password for sample accounts: Password123!`);
await disconnectDb();
