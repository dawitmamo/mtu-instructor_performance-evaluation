import { connectDb, disconnectDb } from './config/db.js';
import { reconcileCommitteeMemberships } from './services/committeeMembership.js';

await connectDb();
try {
  const result = await reconcileCommitteeMemberships();
  console.log(`Committee membership reconciliation complete: ${result.activeMembers} appointed, ${result.removed} stale role(s) removed`);
} finally {
  await disconnectDb();
}
