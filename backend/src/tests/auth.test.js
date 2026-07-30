import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../app.js';
import { connectDb, disconnectDb } from '../config/db.js';
import { User } from '../models/User.js';
import { Department } from '../models/Department.js';

let mongo;
let app;
beforeAll(async () => { mongo = await MongoMemoryServer.create(); await connectDb(mongo.getUri()); app = createApp(); });
afterAll(async () => { await disconnectDb(); await mongo.stop(); });
beforeEach(async () => { await Promise.all([User.deleteMany({}), Department.deleteMany({})]); });

test('lists departments publicly and validates the selected login department', async () => {
  const [computing, engineering] = await Department.create([
    { name: 'Computing', code: 'COMP', faculty: 'Technology' },
    { name: 'Engineering', code: 'ENG', faculty: 'Technology' }
  ]);
  const user = await User.create({
    firstName: 'Department', lastName: 'Head', email: 'department.hod@mtu.edu.et',
    passwordHash: await User.hashPassword('Password123!'), role: 'HOD', department: computing._id
  });

  const available = await request(app).get('/api/auth/departments').expect(200);
  expect(available.body.departments).toEqual(expect.arrayContaining([
    expect.objectContaining({ _id: computing.id, name: 'Computing', code: 'COMP' }),
    expect.objectContaining({ _id: engineering.id, name: 'Engineering', code: 'ENG' })
  ]));

  await request(app).post('/api/auth/login').send({
    email: user.email, password: 'Password123!', userType: 'HOD', department: engineering.id
  }).expect(401);
  const login = await request(app).post('/api/auth/login').send({
    email: user.email, password: 'Password123!', userType: 'HOD', department: computing.id
  }).expect(200);
  expect(String(login.body.user.department)).toBe(computing.id);
});

test('logs in a seeded user and returns tokens', async () => {
  await User.create({ firstName: 'Test', lastName: 'Admin', email: 'admin@mtu.edu.et', passwordHash: await User.hashPassword('Password123!'), role: 'SUPER_ADMIN' });
  const response = await request(app).post('/api/auth/login').send({ email: 'admin@mtu.edu.et', password: 'Password123!' }).expect(200);
  expect(response.body.accessToken).toBeTruthy();
  expect(response.body.refreshToken).toBeTruthy();
  expect(response.body.user.role).toBe('SUPER_ADMIN');
  expect(response.body.user.username).toBe('admin');
  expect((await User.findOne({ email: 'admin@mtu.edu.et' })).username).toBe('admin');
});

test('rejects malformed and disabled-account refresh sessions with 401', async () => {
  const user = await User.create({ firstName: 'Refresh', lastName: 'User', email: 'refresh@mtu.edu.et', passwordHash: await User.hashPassword('Password123!'), role: 'SUPER_ADMIN' });
  await request(app).post('/api/auth/refresh').send({ refreshToken: 'x'.repeat(20) }).expect(401);

  const login = await request(app).post('/api/auth/login').send({ email: user.email, password: 'Password123!' }).expect(200);
  user.isActive = false;
  await user.save();
  await request(app).post('/api/auth/refresh').send({ refreshToken: login.body.refreshToken }).expect(401);
});

test('admin-created accounts can sign in immediately with email and password', async () => {
  const admin = await User.create({ firstName: 'Test', lastName: 'Admin', email: 'admin@mtu.edu.et', passwordHash: await User.hashPassword('Password123!'), role: 'SUPER_ADMIN' });
  const authorization = `Bearer ${(await request(app).post('/api/auth/login').send({ email: admin.email, password: 'Password123!' })).body.accessToken}`;
  await request(app).post('/api/auth/register').set('Authorization', authorization).send({
    firstName: 'Outside', lastName: 'User', email: 'outside@example.com', password: 'Password123!', role: 'SUPER_ADMIN'
  }).expect(400);

  const registration = await request(app).post('/api/auth/register').set('Authorization', authorization).send({
    firstName: 'Managed', lastName: 'User', username: 'managed.admin', email: 'managed@mtu.edu.et', password: 'Password123!', role: 'SUPER_ADMIN'
  }).expect(201);
  expect(registration.body.verificationToken).toBeUndefined();
  expect(registration.body.user.username).toBe('managed.admin');
  const login = await request(app).post('/api/auth/login').send({ email: 'managed@mtu.edu.et', password: 'Password123!' }).expect(200);
  expect(login.body.user.username).toBe('managed.admin');
  await request(app).post('/api/auth/login').send({ username: 'managed.admin', password: 'Password123!' }).expect(200);
  await request(app).post('/api/auth/login').send({ email: 'managed@mtu.edu.et', password: 'Password123!', userType: 'HOD' }).expect(401);
  await request(app).post('/api/auth/login').send({ email: 'managed@mtu.edu.et', password: 'Password123!', userType: 'SUPER_ADMIN' }).expect(200);
}, 10000);

test('public signup is disabled because administrators manage accounts', async () => {
  await request(app).post('/api/auth/signup').send({
    firstName: 'Unsafe', lastName: 'Admin', email: 'unsafe@mtu.edu.et', password: 'Password123!', role: 'SUPER_ADMIN', department: '507f1f77bcf86cd799439011'
  }).expect(401);
});
