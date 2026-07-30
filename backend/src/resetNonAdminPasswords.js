import { connectDb, disconnectDb } from './config/db.js';
import { User } from './models/User.js';

try {
  await connectDb();
  const passwordHash = await User.hashPassword('Password123!');
  const result = await User.updateMany(
    { role: { $ne: 'SUPER_ADMIN' } },
    {
      $set: { passwordHash },
      $inc: { tokenVersion: 1 },
      $unset: { resetPasswordTokenHash: 1, resetPasswordExpiresAt: 1 }
    }
  );
  console.log(`Reset passwords for ${result.modifiedCount} non-admin user account(s).`);
} finally {
  await disconnectDb();
}
