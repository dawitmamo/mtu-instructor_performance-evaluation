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

test('student self-registration stays pending until the department HOD verifies it', async () => {
  const [computing, engineering] = await Department.create([
    { name: 'Computing', code: 'COMP', faculty: 'Technology' },
    { name: 'Engineering', code: 'ENG', faculty: 'Technology' }
  ]);
  const [computingHod, engineeringHod] = await User.create([
    { firstName: 'Computing', lastName: 'HOD', email: 'computing.hod@mtu.edu.et', passwordHash: await User.hashPassword('Password123!'), role: 'HOD', department: computing._id },
    { firstName: 'Engineering', lastName: 'HOD', email: 'engineering.hod@mtu.edu.et', passwordHash: await User.hashPassword('Password123!'), role: 'HOD', department: engineering._id }
  ]);

  const registration = await request(app).post('/api/auth/signup').send({
    firstName: 'New', lastName: 'Student', email: 'new.student@mtu.edu.et', password: 'Password123!',
    role: 'STUDENT', department: computing.id, studentNumber: 'COMP-2026-01', yearLevel: 3
  }).expect(201);
  expect(registration.body.user.registrationStatus).toBe('PENDING');
  expect(registration.body.user.role).toBe('STUDENT');
  expect((await User.findOne({ email: 'new.student@mtu.edu.et' })).isActive).toBe(false);

  const blockedLogin = await request(app).post('/api/auth/login').send({
    email: 'new.student@mtu.edu.et', password: 'Password123!', userType: 'STUDENT', department: computing.id
  }).expect(403);
  expect(blockedLogin.body.message).toMatch(/pending verification/i);

  const foreignToken = (await request(app).post('/api/auth/login').send({ email: engineeringHod.email, password: 'Password123!' })).body.accessToken;
  await request(app).patch(`/api/users/${registration.body.user.id}/registration`)
    .set('Authorization', `Bearer ${foreignToken}`).send({ status: 'APPROVED' }).expect(403);

  const hodToken = (await request(app).post('/api/auth/login').send({ email: computingHod.email, password: 'Password123!' })).body.accessToken;
  const directory = await request(app).get('/api/users').set('Authorization', `Bearer ${hodToken}`).expect(200);
  expect(directory.body.users).toEqual(expect.arrayContaining([
    expect.objectContaining({ email: 'new.student@mtu.edu.et', registrationStatus: 'PENDING' })
  ]));
  await request(app).patch(`/api/users/${registration.body.user.id}/registration`)
    .set('Authorization', `Bearer ${hodToken}`).send({ status: 'APPROVED' }).expect(200);

  const approvedLogin = await request(app).post('/api/auth/login').send({
    email: 'new.student@mtu.edu.et', password: 'Password123!', userType: 'STUDENT', department: computing.id
  }).expect(200);
  expect(approvedLogin.body.user.registrationStatus).toBe('APPROVED');
});

test('public registration accepts only student and instructor roles', async () => {
  const department = await Department.create({ name: 'Computing', code: 'COMP', faculty: 'Technology' });
  await request(app).post('/api/auth/signup').send({
    firstName: 'Unsafe', lastName: 'Admin', email: 'unsafe@mtu.edu.et', password: 'Password123!', role: 'SUPER_ADMIN', department: department.id
  }).expect(400);
});
