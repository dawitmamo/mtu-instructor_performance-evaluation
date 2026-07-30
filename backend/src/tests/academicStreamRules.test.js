import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../app.js';
import { connectDb, disconnectDb } from '../config/db.js';
import { Department } from '../models/Department.js';
import { Semester } from '../models/Semester.js';
import { User } from '../models/User.js';
import { signAccessToken } from '../utils/tokens.js';

let mongo;
let app;
let department;
let semester;
let hod;

function auth(user) {
  return { Authorization: `Bearer ${signAccessToken(user)}` };
}

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
  await Promise.all([User.deleteMany({}), Department.deleteMany({}), Semester.deleteMany({})]);
  department = await Department.create({ code: 'ECE', name: 'Electrical and Computer Engineering', faculty: 'Engineering' });
  semester = await Semester.create({ name: 'Fall', academicYear: '2026/2027', startsAt: new Date('2026-09-01'), endsAt: new Date('2027-01-30'), status: 'OPEN' });
  hod = await User.create({ firstName: 'ECE', lastName: 'Head', email: 'hod.ece@mtu.edu.et', passwordHash: await User.hashPassword('Password123!'), role: 'HOD', department: department._id });
});

test('ECE instructors and upper-year students require a valid stream and assignments stay stream matched', async () => {
  const baseInstructor = { firstName: 'Computer', lastName: 'Instructor', email: 'computer@mtu.edu.et', password: 'Password123!', role: 'INSTRUCTOR', department: department.id };
  await request(app).post('/api/auth/register').set(auth(hod)).send(baseInstructor).expect(400);
  const computerInstructor = await request(app).post('/api/auth/register').set(auth(hod)).send({ ...baseInstructor, academicStream: 'COMPUTER_ENGINEERING' }).expect(201);
  const powerInstructor = await request(app).post('/api/auth/register').set(auth(hod)).send({ ...baseInstructor, firstName: 'Power', email: 'power@mtu.edu.et', academicStream: 'POWER_ENGINEERING' }).expect(201);

  const studentBase = { firstName: 'Upper', lastName: 'Student', email: 'upper@mtu.edu.et', password: 'Password123!', role: 'STUDENT', department: department.id, studentNumber: 'ECE-4001', yearLevel: 4 };
  await request(app).post('/api/auth/register').set(auth(hod)).send({ ...studentBase, email: 'missing.year@mtu.edu.et', studentNumber: 'ECE-MISSING', yearLevel: '' }).expect(400);
  await request(app).post('/api/auth/register').set(auth(hod)).send(studentBase).expect(400);
  const student = await request(app).post('/api/auth/register').set(auth(hod)).send({ ...studentBase, academicStream: 'COMPUTER_ENGINEERING' }).expect(201);
  await request(app).post('/api/auth/register').set(auth(hod)).send({ ...studentBase, email: 'year3@mtu.edu.et', studentNumber: 'ECE-3001', yearLevel: 3, academicStream: 'COMPUTER_ENGINEERING' }).expect(400);

  const course = await request(app).post('/api/courses').set(auth(hod)).send({ code: 'ECE412', title: 'Computer Architecture', creditHours: 3, department: department.id, semester: semester.id, level: 'Year 4', yearLevel: 4, academicStream: 'COMPUTER_ENGINEERING' }).expect(201);

  await request(app).post('/api/assignments').set(auth(hod)).send({ instructor: powerInstructor.body.user.id, course: course.body.course._id, semester: semester.id, enrolledStudents: [student.body.user.id], peerEvaluators: [], status: 'PUBLISHED' }).expect(400);
  await request(app).post('/api/assignments').set(auth(hod)).send({ instructor: computerInstructor.body.user.id, course: course.body.course._id, semester: semester.id, enrolledStudents: [student.body.user.id], peerEvaluators: [powerInstructor.body.user.id], status: 'PUBLISHED' }).expect(201);

  await request(app)
    .put(`/api/users/${student.body.user.id}`)
    .set(auth(hod))
    .send({ ...studentBase, yearLevel: 3, academicStream: '', gpa: '', isActive: true })
    .expect(403);
  const unchangedStudent = await User.findById(student.body.user.id);
  expect(unchangedStudent.yearLevel).toBe(4);
  expect(unchangedStudent.academicStream).toBe('COMPUTER_ENGINEERING');
});
