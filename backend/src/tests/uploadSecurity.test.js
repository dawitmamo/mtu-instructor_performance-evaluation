import request from 'supertest';
import PDFDocument from 'pdfkit';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../app.js';
import { connectDb, disconnectDb } from '../config/db.js';
import { Department } from '../models/Department.js';
import { User } from '../models/User.js';
import { signAccessToken } from '../utils/tokens.js';

let mongo;
let app;
let department;
let foreignDepartment;
let hod;
let instructor;
let student;

function auth(user) {
  return { Authorization: `Bearer ${signAccessToken(user)}` };
}

function csvRow({ email, departmentId, firstName = 'Imported', lastName = 'Student', studentNumber = 'ME-CSV-1' }) {
  return [
    'firstName,lastName,email,studentNumber,department',
    `${firstName},${lastName},${email},${studentNumber},${departmentId}`
  ].join('\n');
}

function pdfBuffer(lines) {
  return new Promise((resolve) => {
    const document = new PDFDocument();
    const chunks = [];
    document.on('data', (chunk) => chunks.push(chunk));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.text(lines.join('\n'));
    document.end();
  });
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
  await Promise.all([User.deleteMany({}), Department.deleteMany({})]);
  [department, foreignDepartment] = await Department.create([
    { name: 'Mechanical Engineering', code: 'ME', faculty: 'Engineering' },
    { name: 'Civil Engineering', code: 'CE', faculty: 'Engineering' }
  ]);
  const passwordHash = await User.hashPassword('OriginalPassword123!');
  [hod, instructor, student] = await User.create([
    { firstName: 'Department', lastName: 'Head', email: 'upload.hod@mtu.edu.et', passwordHash, role: 'HOD', department: department._id },
    { firstName: 'Existing', lastName: 'Instructor', email: 'existing.instructor@mtu.edu.et', passwordHash, role: 'INSTRUCTOR', department: department._id },
    { firstName: 'Existing', lastName: 'Student', email: 'existing.student@mtu.edu.et', passwordHash, role: 'STUDENT', department: department._id, studentNumber: 'ME-OLD' }
  ]);
});

test('department CSV imports cannot cross departments or overwrite staff accounts', async () => {
  await request(app)
    .post('/api/uploads/students')
    .set(auth(hod))
    .attach('file', Buffer.from(csvRow({ email: 'foreign.student@mtu.edu.et', departmentId: foreignDepartment.id })), 'students.csv')
    .expect(403);

  await request(app)
    .post('/api/uploads/students')
    .set(auth(hod))
    .attach('file', Buffer.from(csvRow({ email: instructor.email, departmentId: department.id })), 'students.csv')
    .expect(409);

  expect((await User.findById(instructor.id)).role).toBe('INSTRUCTOR');
});

test('CSV imports reject accounts outside the mtu.edu.et domain', async () => {
  const response = await request(app)
    .post('/api/uploads/students')
    .set(auth(hod))
    .attach('file', Buffer.from(csvRow({ email: 'external@example.com', departmentId: department.id })), 'students.csv')
    .expect(400);
  expect(response.body.message).toContain('@mtu.edu.et');
});

test('updating a student by CSV preserves the current password unless a new password is provided', async () => {
  await request(app)
    .post('/api/uploads/students')
    .set(auth(hod))
    .attach('file', Buffer.from(csvRow({ email: student.email, departmentId: department.id, firstName: 'Updated', studentNumber: 'ME-NEW' })), 'students.csv')
    .expect(201);

  const updated = await User.findById(student.id);
  expect(updated.firstName).toBe('Updated');
  expect(updated.studentNumber).toBe('ME-NEW');
  const login = await request(app).post('/api/auth/login').send({ email: student.email, password: 'OriginalPassword123!' }).expect(200);
  expect(login.body.user.role).toBe('STUDENT');
});

test('generic imports register instructors from CSV and readable-text PDF files', async () => {
  const csv = [
    'firstName,lastName,email,employeeNumber,department',
    `CSV,Instructor,csv.instructor@mtu.edu.et,INS-CSV-1,${department.id}`
  ].join('\n');
  const csvResult = await request(app)
    .post('/api/uploads/users')
    .set(auth(hod))
    .field('role', 'INSTRUCTOR')
    .attach('file', Buffer.from(csv), 'instructors.csv')
    .expect(201);
  expect(csvResult.body.role).toBe('INSTRUCTOR');
  expect(csvResult.body.instructors[0].identifier).toBe('INS-CSV-1');

  const pdf = await pdfBuffer([
    'First Name: PDF',
    'Last Name: Instructor',
    'Email: pdf.instructor@mtu.edu.et',
    'Employee Number: INS-PDF-1',
    `Department: ${department.id}`
  ]);
  const pdfResult = await request(app)
    .post('/api/uploads/users')
    .set(auth(hod))
    .field('role', 'INSTRUCTOR')
    .attach('file', pdf, 'instructors.pdf');
  expect(pdfResult.body.details).toBeUndefined();
  expect(pdfResult.status).toBe(201);
  expect(pdfResult.body.instructors[0].identifier).toBe('INS-PDF-1');

  const imported = await User.find({ email: { $in: ['csv.instructor@mtu.edu.et', 'pdf.instructor@mtu.edu.et'] } })
    .select('+resetPasswordTokenHash +resetPasswordExpiresAt');
  expect(imported).toHaveLength(2);
  expect(imported.every((user) => user.role === 'INSTRUCTOR' && String(user.department) === department.id)).toBe(true);
  expect(imported.every((user) => user.requiresPasswordSetup)).toBe(true);
  expect(imported.every((user) => user.resetPasswordTokenHash?.length === 64 && user.resetPasswordExpiresAt > new Date())).toBe(true);
  await request(app).post('/api/auth/login').send({ email: 'csv.instructor@mtu.edu.et', password: 'Password123!' }).expect(401);
}, 15000);
