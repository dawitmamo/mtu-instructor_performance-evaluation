import { createApp } from './app.js';
import { connectDb, disconnectDb } from './config/db.js';
import { env, validateRuntimeConfig } from './config/env.js';
import { seedDemoData } from './services/demoData.js';
import { reconcileCommitteeMemberships } from './services/committeeMembership.js';
import { ensureEvaluationIndexes } from './services/evaluationIndexes.js';
import { ensureNotificationIndexes } from './services/notificationIndexes.js';
import { ensureReportIndexes } from './services/reportIndexes.js';
import { startEmailDeliveryWorker } from './services/notificationEmail.js';

validateRuntimeConfig();
await connectDb();
await ensureEvaluationIndexes();
await ensureNotificationIndexes();
await ensureReportIndexes();
if (env.nodeEnv === 'development' && env.seedDemoData) {
  const seeded = await seedDemoData();
  if (seeded) console.log('Demo data created. Sign in with admin@mtu.edu.et / admin12345');
}
await reconcileCommitteeMemberships();
startEmailDeliveryWorker();
const app = createApp();
const server = app.listen(env.port, () => console.log(`API listening on port ${env.port}`));

async function shutdown() {
  server.close(async () => {
    await disconnectDb();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
