import request from 'supertest';
import crypto from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../app.js';
import { connectDb, disconnectDb } from '../config/db.js';
import { User } from '../models/User.js';

let mongo;
let app;

beforeAll(async () => {
  if (process.env.TEST_MONGO_URI) {
    await connectDb(process.env.TEST_MONGO_URI);
  } else {
    mongo = await MongoMemoryServer.create();
    await connectDb(mongo.getUri());
  }
  app = createApp();
}, 120000);
afterAll(async () => {
  await User.deleteMany({ email: { $in: ['security@mtu.edu.et', 'unknown@mtu.edu.et'] } });
  await disconnectDb();
  if (mongo) await mongo.stop();
});
beforeEach(async () => { await User.deleteMany({}); });

async function createUser(email = 'security@mtu.edu.et') {
  return User.create({
    firstName: 'Security',
    lastName: 'User',
    email,
    passwordHash: await User.hashPassword('Password123!'),
    role: 'SUPER_ADMIN'
  });
}

test('authenticated users can change their password and receive a fresh session', async () => {
  const user = await createUser();
  const login = await request(app).post('/api/auth/login').send({ email: user.email, password: 'Password123!' }).expect(200);

  const changed = await request(app)
    .post('/api/auth/change-password')
    .set('Authorization', `Bearer ${login.body.accessToken}`)
    .send({ currentPassword: 'Password123!', newPassword: 'StrongerPassword456!' })
    .expect(200);

  expect(changed.body.message).toBe('Password changed successfully');
  expect(changed.body.accessToken).toBeTruthy();
  expect(changed.body.refreshToken).toBeTruthy();
  expect(changed.body.refreshToken).not.toBe(login.body.refreshToken);
  await request(app).post('/api/auth/refresh').send({ refreshToken: login.body.refreshToken }).expect(401);
  await request(app).post('/api/auth/login').send({ email: user.email, password: 'Password123!' }).expect(401);
  await request(app).post('/api/auth/login').send({ email: user.email, password: 'StrongerPassword456!' }).expect(200);
});

test('password reset tokens are generic, expiring, single-use, and replace the password', async () => {
  const user = await createUser();
  const unknown = await request(app).post('/api/auth/forgot-password').send({ email: 'unknown@mtu.edu.et' }).expect(200);
  expect(unknown.body.message).toBe('If the account exists, password reset instructions have been prepared.');
  expect(unknown.body.resetToken).toBeUndefined();

  const requested = await request(app).post('/api/auth/forgot-password').send({ email: user.email }).expect(200);
  expect(requested.body.message).toBe(unknown.body.message);
  expect(requested.body.resetToken).toHaveLength(64);

  await request(app).post('/api/auth/reset-password').send({ token: 'f'.repeat(64), newPassword: 'ResetPassword789!' }).expect(400);
  await request(app).post('/api/auth/reset-password').send({ token: requested.body.resetToken, newPassword: 'ResetPassword789!' }).expect(200);
  await request(app).post('/api/auth/reset-password').send({ token: requested.body.resetToken, newPassword: 'AnotherPassword789!' }).expect(400);
  await request(app).post('/api/auth/login').send({ email: user.email, password: 'Password123!' }).expect(401);
  await request(app).post('/api/auth/login').send({ email: user.email, password: 'ResetPassword789!' }).expect(200);
});

test('expired reset tokens are rejected', async () => {
  const user = await createUser();
  const token = crypto.randomBytes(32).toString('hex');
  await User.updateOne({ _id: user._id }, {
    resetPasswordTokenHash: crypto.createHash('sha256').update(token).digest('hex'),
    resetPasswordExpiresAt: new Date(Date.now() - 1000)
  });

  await request(app).post('/api/auth/reset-password').send({ token, newPassword: 'ExpiredPassword789!' }).expect(400);
  await request(app).post('/api/auth/login').send({ email: user.email, password: 'Password123!' }).expect(200);
});
