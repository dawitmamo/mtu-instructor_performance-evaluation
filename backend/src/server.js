import { createApp } from './app.js';
import { connectDb, disconnectDb } from './config/db.js';
import { env } from './config/env.js';
import { seedDemoData } from './services/demoData.js';

await connectDb();
if (env.nodeEnv === 'development' && env.seedDemoData) {
  const seeded = await seedDemoData();
  if (seeded) console.log('Demo data created. Sign in with admin@mtu.edu.et / Password123!');
}
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
