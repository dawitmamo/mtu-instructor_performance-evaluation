import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../app.js';
import { connectDb, disconnectDb } from '../config/db.js';
import { Department } from '../models/Department.js';
import { Schedule } from '../models/Schedule.js';
import { Semester } from '../models/Semester.js';
import { User } from '../models/User.js';
import { signAccessToken } from '../utils/tokens.js';

let mongo;
let app;
let department;
let foreignDepartment;
let semester;
let hod;
let courseCommittee;
let examCommittee;
let instructor;
let student;
let foreignStudent;

function auth(user) {
  return { Authorization: `Bearer ${signAccessToken(user)}` };
}

function scheduleRequest(user, overrides = {}) {
  const fields = {
    title: 'Second Semester Schedule',
    description: 'Monday 08:00 - Circuit Analysis - Block A, Room 12',
    scheduleType: 'CLASS',
    department: department.id,
    semester: semester.id,
    status: 'PUBLISHED',
    ...overrides
  };
  let operation = request(app).post('/api/schedules').set(auth(user));
  for (const [key, value] of Object.entries(fields)) operation = operation.field(key, String(value));
  return operation;
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
  await Promise.all([Schedule.deleteMany({}), User.deleteMany({}), Department.deleteMany({}), Semester.deleteMany({})]);
  [department, foreignDepartment] = await Department.create([
    { name: 'Electrical and Computer Engineering', code: 'ECE', faculty: 'Engineering' },
    { name: 'Civil Engineering', code: 'CE', faculty: 'Engineering' }
  ]);
  semester = await Semester.create({ name: 'Second Semester', academicYear: '2026/2027', startsAt: new Date('2027-02-01'), endsAt: new Date('2027-06-30'), status: 'OPEN' });
  const passwordHash = await User.hashPassword('Password123!');
  [hod, courseCommittee, examCommittee, instructor, student, foreignStudent] = await User.create([
    { firstName: 'Department', lastName: 'Head', email: 'schedule.hod@mtu.edu.et', passwordHash, role: 'HOD', department: department._id },
    { firstName: 'Course', lastName: 'Committee', email: 'schedule.course@mtu.edu.et', passwordHash, role: 'INSTRUCTOR', committeeRoles: ['COURSE_COMMITTEE'], department: department._id, academicStream: 'COMPUTER_ENGINEERING' },
    { firstName: 'Exam', lastName: 'Committee', email: 'schedule.exam@mtu.edu.et', passwordHash, role: 'INSTRUCTOR', committeeRoles: ['EXAM_COMMITTEE'], department: department._id, academicStream: 'POWER_ENGINEERING' },
    { firstName: 'Regular', lastName: 'Instructor', email: 'schedule.instructor@mtu.edu.et', passwordHash, role: 'INSTRUCTOR', department: department._id, academicStream: 'CONTROL_ENGINEERING' },
    { firstName: 'Department', lastName: 'Student', email: 'schedule.student@mtu.edu.et', passwordHash, role: 'STUDENT', department: department._id, studentNumber: 'ECE-SCH-1', yearLevel: 3 },
    { firstName: 'Foreign', lastName: 'Student', email: 'schedule.foreign@mtu.edu.et', passwordHash, role: 'STUDENT', department: foreignDepartment._id, studentNumber: 'CE-SCH-1' }
  ]);
});

test('HOD, Course Committee, and Exam Committee can prepare or upload department schedules', async () => {
  const hodUpload = await scheduleRequest(hod, { title: 'HOD Exam Schedule', description: '', scheduleType: 'EXAM' })
    .attach('file', Buffer.from('%PDF-1.4 schedule'), { filename: 'exam-schedule.pdf', contentType: 'application/pdf' })
    .expect(201);
  expect(hodUpload.body.schedule.fileName).toBe('exam-schedule.pdf');

  await scheduleRequest(courseCommittee, { title: 'Course Committee Schedule' })
    .attach('file', Buffer.from('day,time,course\nMonday,08:00,ECE201'), { filename: 'class-schedule.csv', contentType: 'text/csv' })
    .expect(201);

  await scheduleRequest(examCommittee, { title: 'Exam Committee Schedule', scheduleType: 'COMBINED' }).expect(201);
  await scheduleRequest(instructor, { title: 'Unauthorized Schedule' }).expect(403);
  await scheduleRequest(hod, { title: 'Foreign Schedule', department: foreignDepartment.id }).expect(403);
  expect(await Schedule.countDocuments()).toBe(3);
});

test('students and instructors see and download only published schedules in their department', async () => {
  const published = await scheduleRequest(hod, { title: 'Published Schedule' })
    .attach('file', Buffer.from('%PDF-1.4 published'), { filename: 'published.pdf', contentType: 'application/pdf' })
    .expect(201);
  const draft = await scheduleRequest(hod, { title: 'Manager Draft', status: 'DRAFT' })
    .attach('file', Buffer.from('%PDF-1.4 draft'), { filename: 'draft.pdf', contentType: 'application/pdf' })
    .expect(201);
  await Schedule.create({
    title: 'Foreign Published Schedule', description: 'Foreign department only', scheduleType: 'CLASS',
    department: foreignDepartment._id, semester: semester._id, status: 'PUBLISHED', uploadedBy: hod._id, publishedAt: new Date()
  });

  const studentList = await request(app).get('/api/schedules').set(auth(student)).expect(200);
  expect(studentList.body.schedules.map((item) => item.title)).toEqual(['Published Schedule']);
  const instructorList = await request(app).get('/api/schedules').set(auth(instructor)).expect(200);
  expect(instructorList.body.schedules.map((item) => item.title)).toEqual(['Published Schedule']);
  const managerList = await request(app).get('/api/schedules').set(auth(courseCommittee)).expect(200);
  expect(managerList.body.schedules.map((item) => item.title)).toEqual(expect.arrayContaining(['Published Schedule', 'Manager Draft']));
  const foreignList = await request(app).get('/api/schedules').set(auth(foreignStudent)).expect(200);
  expect(foreignList.body.schedules.map((item) => item.title)).toEqual(['Foreign Published Schedule']);

  const download = await request(app).get(`/api/schedules/${published.body.schedule._id}/file`).set(auth(student)).expect(200);
  expect(download.headers['content-type']).toContain('application/pdf');
  await request(app).get(`/api/schedules/${draft.body.schedule._id}/file`).set(auth(student)).expect(404);
  await request(app).get(`/api/schedules/${draft.body.schedule._id}/file`).set(auth(hod)).expect(200);
});

test('schedule uploads reject unsupported attachments and empty schedule content', async () => {
  await scheduleRequest(hod, { title: 'Unsafe Attachment', description: '' })
    .attach('file', Buffer.from('not allowed'), { filename: 'schedule.exe', contentType: 'application/octet-stream' })
    .expect(400);
  await scheduleRequest(hod, { title: 'Empty Schedule', description: '' }).expect(400);
});
