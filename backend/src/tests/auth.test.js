import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../app.js';
import { connectDb, disconnectDb } from '../config/db.js';
import { User } from '../models/User.js';

let mongo;
let app;
beforeAll(async () => { mongo = await MongoMemoryServer.create(); await connectDb(mongo.getUri()); app = createApp(); });
afterAll(async () => { await disconnectDb(); await mongo.stop(); });
beforeEach(async () => { await User.deleteMany({}); });

test('logs in a seeded user and returns tokens', async () => {
  await User.create({ firstName: 'Test', lastName: 'Admin', email: 'admin@mtu.edu.et', passwordHash: await User.hashPassword('Password123!'), role: 'SUPER_ADMIN' });
  const response = await request(app).post('/api/auth/login').send({ email: 'admin@mtu.edu.et', password: 'Password123!' }).expect(200);
  expect(response.body.accessToken).toBeTruthy();
  expect(response.body.refreshToken).toBeTruthy();
  expect(response.body.user.role).toBe('SUPER_ADMIN');
});

test('rejects malformed and disabled-account refresh sessions with 401', async () => {
  const user = await User.create({ firstName: 'Refresh', lastName: 'User', email: 'refresh@mtu.edu.et', passwordHash: await User.hashPassword('Password123!'), role: 'SUPER_ADMIN' });
  await request(app).post('/api/auth/refresh').send({ refreshToken: 'x'.repeat(20) }).expect(401);

  const login = await request(app).post('/api/auth/login').send({ email: user.email, password: 'Password123!' }).expect(200);
  user.isActive = false;
  await user.save();
  await request(app).post('/api/auth/refresh').send({ refreshToken: login.body.refreshToken }).expect(401);
});
