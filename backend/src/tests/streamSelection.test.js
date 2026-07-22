import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../app.js';
import { connectDb, disconnectDb } from '../config/db.js';
import { ACADEMIC_STREAMS } from '../constants/academicStreams.js';
import { Department } from '../models/Department.js';
import { Semester } from '../models/Semester.js';
import { StreamPreference } from '../models/StreamPreference.js';
import { StreamSelectionRound } from '../models/StreamSelectionRound.js';
import { User } from '../models/User.js';
import { signAccessToken } from '../utils/tokens.js';

let mongo;
let app;
let department;
let semester;
let hod;
let examMember;
let courseMember;
let students;

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
  await Promise.all([
    User.deleteMany({}),
    Department.deleteMany({}),
    Semester.deleteMany({}),
    StreamPreference.deleteMany({}),
    StreamSelectionRound.deleteMany({})
  ]);

  department = await Department.create({ name: 'Electrical and Computer Engineering', code: 'ECE', faculty: 'Engineering' });
  semester = await Semester.create({
    name: 'Second Semester',
    academicYear: '2026/2027',
    startsAt: new Date('2027-01-05'),
    endsAt: new Date('2027-06-20'),
    status: 'OPEN'
  });
  const passwordHash = await User.hashPassword('Password123!');
  [hod, examMember, courseMember] = await User.create([
    { firstName: 'Department', lastName: 'Head', email: 'hod.stream@mtu.edu.et', passwordHash, role: 'HOD', department: department._id },
    { firstName: 'Exam', lastName: 'Member', email: 'exam.stream@mtu.edu.et', passwordHash, role: 'INSTRUCTOR', committeeRoles: ['EXAM_COMMITTEE'], department: department._id },
    { firstName: 'Course', lastName: 'Member', email: 'course.stream@mtu.edu.et', passwordHash, role: 'INSTRUCTOR', committeeRoles: ['COURSE_COMMITTEE'], department: department._id }
  ]);
  students = await User.create([3.95, 3.7, 3.45, 3.2, 2.9].map((gpa, index) => ({
    firstName: `Student${index + 1}`,
    lastName: 'ECE',
    email: `stream.student.${index + 1}@mtu.edu.et`,
    passwordHash,
    role: 'STUDENT',
    department: department._id,
    studentNumber: `ECE-3-${index + 1}`,
    yearLevel: 3,
    gpa
  })));
});

test('Year 3 students rank three unique streams while unrelated committee duties remain forbidden', async () => {
  const roundResponse = await request(app)
    .post('/api/stream-selection/rounds')
    .set(auth(hod))
    .send({
      semester: semester.id,
      status: 'OPEN',
      capacities: ACADEMIC_STREAMS.map((academicStream, index) => ({ academicStream, seats: index < 3 ? 1 : 2 }))
    })
    .expect(201);

  await request(app)
    .get('/api/stream-selection/manage')
    .set(auth(courseMember))
    .expect(403);

  await request(app)
    .post('/api/stream-selection/preferences')
    .set(auth(students[0]))
    .send({ round: roundResponse.body.round._id, choices: [ACADEMIC_STREAMS[0], ACADEMIC_STREAMS[0], ACADEMIC_STREAMS[1]] })
    .expect(400);

  const submitted = await request(app)
    .post('/api/stream-selection/preferences')
    .set(auth(students[0]))
    .send({ round: roundResponse.body.round._id, choices: ACADEMIC_STREAMS.slice(0, 3) })
    .expect(201);
  expect(submitted.body.preference.choices).toEqual(ACADEMIC_STREAMS.slice(0, 3));

  const status = await request(app)
    .get('/api/stream-selection/student')
    .set(auth(students[0]))
    .expect(200);
  expect(status.body.eligible).toBe(true);
  expect(status.body.gpa).toBe(3.95);
  expect(status.body.preference.status).toBe('SUBMITTED');
});

test('Exam Committee allocates by descending GPA, respects capacity, and uses the unranked fourth stream as fallback', async () => {
  const roundResponse = await request(app)
    .post('/api/stream-selection/rounds')
    .set(auth(examMember))
    .send({
      semester: semester.id,
      status: 'OPEN',
      capacities: [
        { academicStream: ACADEMIC_STREAMS[0], seats: 1 },
        { academicStream: ACADEMIC_STREAMS[1], seats: 1 },
        { academicStream: ACADEMIC_STREAMS[2], seats: 1 },
        { academicStream: ACADEMIC_STREAMS[3], seats: 2 }
      ]
    })
    .expect(201);
  const roundId = roundResponse.body.round._id;

  for (const student of [...students].reverse()) {
    await request(app)
      .post('/api/stream-selection/preferences')
      .set(auth(student))
      .send({ round: roundId, choices: ACADEMIC_STREAMS.slice(0, 3) })
      .expect(201);
  }

  await request(app)
    .post('/api/stream-selection/rounds')
    .set(auth(examMember))
    .send({
      semester: semester.id,
      status: 'CLOSED',
      capacities: [
        { academicStream: ACADEMIC_STREAMS[0], seats: 1 },
        { academicStream: ACADEMIC_STREAMS[1], seats: 1 },
        { academicStream: ACADEMIC_STREAMS[2], seats: 1 },
        { academicStream: ACADEMIC_STREAMS[3], seats: 2 }
      ]
    })
    .expect(200);

  const management = await request(app)
    .get('/api/stream-selection/manage')
    .set(auth(examMember))
    .expect(200);
  expect(management.body.eligibleStudents.map((student) => student.gpa)).toEqual([3.95, 3.7, 3.45, 3.2, 2.9]);

  const allocated = await request(app)
    .post(`/api/stream-selection/rounds/${roundId}/allocate`)
    .set(auth(examMember))
    .expect(200);
  expect(allocated.body.round.status).toBe('ALLOCATED');

  const results = await StreamPreference.find({ round: roundId }).populate('student').sort({ gpaSnapshot: -1 });
  expect(results.map((result) => result.allocatedStream)).toEqual([...ACADEMIC_STREAMS, ACADEMIC_STREAMS[3]]);
  expect(results.map((result) => result.allocationRank)).toEqual([1, 2, 3, 4, 4]);
  expect(results.map((result) => result.gpaSnapshot)).toEqual([3.95, 3.7, 3.45, 3.2, 2.9]);
  expect(Object.values(allocated.body.remainingCapacity).every((seats) => seats === 0)).toBe(true);

  const studentResult = await request(app)
    .get('/api/stream-selection/student')
    .set(auth(students[4]))
    .expect(200);
  expect(studentResult.body.preference.allocatedStream).toBe(ACADEMIC_STREAMS[3]);
  expect(studentResult.body.preference.allocationRank).toBe(4);
});

test('allocation is blocked until submitted students have GPA and total capacity is sufficient', async () => {
  const passwordHash = await User.hashPassword('Password123!');
  const missingGpaStudent = await User.create({
    firstName: 'Missing',
    lastName: 'GPA',
    email: 'missing.gpa@mtu.edu.et',
    passwordHash,
    role: 'STUDENT',
    department: department._id,
    studentNumber: 'ECE-3-99',
    yearLevel: 3
  });
  const roundResponse = await request(app)
    .post('/api/stream-selection/rounds')
    .set(auth(hod))
    .send({
      semester: semester.id,
      status: 'OPEN',
      capacities: ACADEMIC_STREAMS.map((academicStream) => ({ academicStream, seats: 1 }))
    })
    .expect(201);
  const roundId = roundResponse.body.round._id;

  await request(app).post('/api/stream-selection/preferences').set(auth(students[0])).send({ round: roundId, choices: ACADEMIC_STREAMS.slice(0, 3) }).expect(201);
  await request(app).post('/api/stream-selection/preferences').set(auth(missingGpaStudent)).send({ round: roundId, choices: ACADEMIC_STREAMS.slice(0, 3) }).expect(201);
  for (const student of students.slice(1)) {
    await request(app).post('/api/stream-selection/preferences').set(auth(student)).send({ round: roundId, choices: ACADEMIC_STREAMS.slice(0, 3) }).expect(201);
  }
  await StreamSelectionRound.updateOne({ _id: roundId }, { status: 'CLOSED', capacities: ACADEMIC_STREAMS.map((academicStream) => ({ academicStream, seats: 2 })) });
  const missingGpa = await request(app).post(`/api/stream-selection/rounds/${roundId}/allocate`).set(auth(hod)).expect(400);
  expect(missingGpa.body.message).toMatch(/GPA is missing/);

  missingGpaStudent.gpa = 2.5;
  await missingGpaStudent.save();
  await StreamSelectionRound.updateOne({ _id: roundId }, { capacities: ACADEMIC_STREAMS.map((academicStream) => ({ academicStream, seats: 0 })) });
  const insufficient = await request(app).post(`/api/stream-selection/rounds/${roundId}/allocate`).set(auth(hod)).expect(400);
  expect(insufficient.body.message).toMatch(/Total capacity/);
});
