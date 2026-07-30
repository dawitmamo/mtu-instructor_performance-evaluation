import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../app.js';
import { connectDb, disconnectDb } from '../config/db.js';
import { Department } from '../models/Department.js';
import { User } from '../models/User.js';
import { signAccessToken } from '../utils/tokens.js';

let mongo;
let app;
let users;

function auth(user) {
  return { Authorization: `Bearer ${signAccessToken(user)}` };
}

const validPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nWQAAAAASUVORK5CYII=', 'base64');

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await connectDb(mongo.getUri());
  app = createApp();
});

afterAll(async () => {
  await disconnectDb();
  await mongo.stop();
});

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Department.deleteMany({})]);
  const department = await Department.create({ name: 'Computer Science', code: 'CS', faculty: 'Computing' });
  const passwordHash = await User.hashPassword('Password123!');
  users = await User.create([
    { firstName: 'System', lastName: 'Admin', email: 'profile.admin@mtu.edu.et', passwordHash, role: 'SUPER_ADMIN' },
    { firstName: 'Department', lastName: 'Head', email: 'profile.hod@mtu.edu.et', passwordHash, role: 'HOD', department: department._id },
    { firstName: 'Course', lastName: 'Instructor', email: 'profile.instructor@mtu.edu.et', passwordHash, role: 'INSTRUCTOR', department: department._id, employeeNumber: 'INS-PROFILE-1' },
    { firstName: 'Course', lastName: 'Student', email: 'profile.student@mtu.edu.et', passwordHash, role: 'STUDENT', department: department._id, studentNumber: 'STU-PROFILE-1' }
  ]);
});

test.each([0, 1, 2, 3])('every account role can edit safe self-profile fields and cannot change controlled identity fields (%s)', async (index) => {
  const user = users[index];
  const response = await request(app).put('/api/auth/profile').set(auth(user)).send({
    firstName: `Updated${index}`,
    lastName: 'Profile',
    phone: `+25190000000${index}`,
    bio: `Self-service profile for ${user.role}`,
    email: 'unauthorized-change@mtu.edu.et',
    role: 'SUPER_ADMIN',
    department: null
  }).expect(200);

  expect(response.body.user.firstName).toBe(`Updated${index}`);
  expect(response.body.user.phone).toBe(`+25190000000${index}`);
  expect(response.body.user.bio).toContain(user.role);
  expect(response.body.user.email).toBe(user.email);
  expect(response.body.user.role).toBe(user.role);
  const stored = await User.findById(user._id);
  expect(stored.email).toBe(user.email);
  expect(stored.role).toBe(user.role);
  expect(String(stored.department || '')).toBe(String(user.department || ''));
});

test('authenticated users can upload, retrieve, replace, and remove their profile photo', async () => {
  const user = users[2];
  const uploaded = await request(app).post('/api/auth/profile/photo').set(auth(user))
    .attach('photo', validPng, { filename: 'profile.png', contentType: 'image/png' })
    .expect(201);
  expect(uploaded.body.user.hasProfilePhoto).toBe(true);
  expect(uploaded.body.user.profilePhotoUpdatedAt).toBeTruthy();

  const photo = await request(app).get(`/api/auth/profile/photo/${user.id}`).set(auth(user)).expect(200);
  expect(photo.headers['content-type']).toContain('image/png');
  expect(Buffer.isBuffer(photo.body)).toBe(true);
  await request(app).get(`/api/auth/profile/photo/${user.id}`).expect(401);

  await request(app).post('/api/auth/profile/photo').set(auth(user))
    .attach('photo', validPng, { filename: 'profile.txt', contentType: 'image/png' })
    .expect(400);
  await request(app).post('/api/auth/profile/photo').set(auth(user))
    .attach('photo', Buffer.from('not an image'), { filename: 'profile.png', contentType: 'image/png' })
    .expect(400);

  const removed = await request(app).delete('/api/auth/profile/photo').set(auth(user)).expect(200);
  expect(removed.body.user.hasProfilePhoto).toBe(false);
  await request(app).get(`/api/auth/profile/photo/${user.id}`).set(auth(user)).expect(404);
});

test('profile photo upload is limited to two megabytes', async () => {
  await request(app).post('/api/auth/profile/photo').set(auth(users[0]))
    .attach('photo', Buffer.alloc(2 * 1024 * 1024 + 1, 0xff), { filename: 'large.jpg', contentType: 'image/jpeg' })
    .expect(400)
    .expect(({ body }) => expect(body.message).toBe('Profile photo must be 2 MB or smaller'));
});