import { connectDb, disconnectDb } from './config/db.js';
import { User } from './models/User.js';
import { isMtuEmail } from './utils/email.js';

await connectDb();
try {
  const users = await User.find({}).select('email');
  const changes = users
    .filter((user) => !isMtuEmail(user.email))
    .map((user) => ({ user, email: `${String(user.email).split('@')[0].trim().toLowerCase()}@mtu.edu.et` }));

  const duplicateTargets = changes
    .map((item) => item.email)
    .filter((email, index, items) => items.indexOf(email) !== index);
  if (duplicateTargets.length) throw new Error(`Email migration conflict: ${[...new Set(duplicateTargets)].join(', ')}`);

  const targetEmails = changes.map((item) => item.email);
  const occupied = targetEmails.length ? await User.find({ email: { $in: targetEmails } }).select('email') : [];
  const changedIds = new Set(changes.map((item) => item.user.id));
  const conflicts = occupied.filter((user) => !changedIds.has(user.id));
  if (conflicts.length) throw new Error(`Email migration target already exists: ${conflicts.map((user) => user.email).join(', ')}`);

  for (const { user, email } of changes) {
    await User.updateOne({ _id: user._id }, { $set: { email } });
  }
  console.log(`MTU email migration complete: ${changes.length} account(s) updated`);
} finally {
  await disconnectDb();
}
