import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../app.js';
import { connectDb, disconnectDb } from '../config/db.js';
import { Course } from '../models/Course.js';
import { CoursePreference } from '../models/CoursePreference.js';
import { Department } from '../models/Department.js';
import { ExamCommittee } from '../models/ExamCommittee.js';
import { InstructorAssignment } from '../models/InstructorAssignment.js';
import { Notification } from '../models/Notification.js';
import { Semester } from '../models/Semester.js';
import { User } from '../models/User.js';
import { signAccessToken } from '../utils/tokens.js';

let mongo;
let app;
let department;
let foreignDepartment;
let semester;
let courses;
let hod;
let committee;
let instructor;
let secondInstructor;
let foreignHod;
let student;

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
    CoursePreference.deleteMany({}),
    ExamCommittee.deleteMany({}),
    InstructorAssignment.deleteMany({}),
    Notification.deleteMany({}),
    Course.deleteMany({}),
    User.deleteMany({}),
    Department.deleteMany({}),
    Semester.deleteMany({})
  ]);
  [department, foreignDepartment] = await Department.create([
    { name: 'Computer Science', code: 'CS', faculty: 'Computing' },
    { name: 'Civil Engineering', code: 'CE', faculty: 'Engineering' }
  ]);
  semester = await Semester.create({ name: 'First Semester', academicYear: '2026/2027', startsAt: new Date('2026-09-01'), endsAt: new Date('2027-01-31'), status: 'OPEN' });
  courses = await Course.create([
    { code: 'CS201', title: 'Data Structures', department: department._id, semester: semester._id },
    { code: 'CS202', title: 'Database Systems', department: department._id, semester: semester._id },
    { code: 'CS203', title: 'Computer Networks', department: department._id, semester: semester._id },
    { code: 'CS204', title: 'Software Engineering', department: department._id, semester: semester._id }
  ]);
  const passwordHash = await User.hashPassword('Password123!');
  [hod, committee, instructor, secondInstructor, foreignHod, student] = await User.create([
    { firstName: 'Department', lastName: 'Head', email: 'preference.hod@mtu.edu.et', passwordHash, role: 'HOD', department: department._id },
    { firstName: 'Course', lastName: 'Committee', email: 'preference.committee@mtu.edu.et', passwordHash, role: 'INSTRUCTOR', committeeRoles: ['COURSE_EXAM_COMMITTEE'], department: department._id },
    { firstName: 'First', lastName: 'Instructor', email: 'preference.first@mtu.edu.et', passwordHash, role: 'INSTRUCTOR', department: department._id },
    { firstName: 'Second', lastName: 'Instructor', email: 'preference.second@mtu.edu.et', passwordHash, role: 'INSTRUCTOR', department: department._id },
    { firstName: 'Foreign', lastName: 'Head', email: 'preference.foreign@mtu.edu.et', passwordHash, role: 'HOD', department: foreignDepartment._id },
    { firstName: 'Course', lastName: 'Student', email: 'preference.student@mtu.edu.et', passwordHash, role: 'STUDENT', department: department._id, studentNumber: 'CS-PREF-1' }
  ]);
  await ExamCommittee.create({
    department: department._id,
    semester: semester._id,
    members: [committee._id, instructor._id, secondInstructor._id],
    chair: committee._id,
    appointedBy: hod._id
  });
});

test('instructor submits up to three ranked courses and both department managers are notified', async () => {
  const response = await request(app).post('/api/course-preferences').set(auth(instructor)).send({
    semester: semester.id,
    choices: [courses[0].id, courses[1].id, courses[2].id]
  }).expect(201);

  expect(response.body.preference.choices.map((course) => course.code)).toEqual(['CS201', 'CS202', 'CS203']);
  expect(response.body.preference.status).toBe('SUBMITTED');
  const notifications = await Notification.find({ title: 'Instructor course preference submitted' });
  expect(notifications.map((notification) => String(notification.user)).sort()).toEqual([hod.id, committee.id].sort());

  const management = await request(app).get(`/api/course-preferences/manage?semester=${semester.id}`).set(auth(committee)).expect(200);
  expect(management.body.preferences).toHaveLength(1);
  expect(management.body.preferences[0].instructor.email).toBe(instructor.email);

  await request(app).post('/api/course-preferences').set(auth(instructor)).send({ semester: semester.id, choices: [] }).expect(400);
  await request(app).post('/api/course-preferences').set(auth(student)).send({ semester: semester.id, choices: [courses[0].id] }).expect(403);
});

test('committee recommends first and HOD finalizes the course assignment', async () => {
  const submitted = await request(app).post('/api/course-preferences').set(auth(instructor)).send({
    semester: semester.id,
    choices: [courses[0].id, courses[1].id, courses[2].id]
  }).expect(201);

  await request(app)
    .post(`/api/course-preferences/${submitted.body.preference._id}/finalize`)
    .set(auth(hod))
    .send({ course: courses[1].id, note: 'Department teaching need' })
    .expect(409);
  await request(app)
    .post(`/api/course-preferences/${submitted.body.preference._id}/finalize`)
    .set(auth(committee))
    .send({ course: courses[1].id, note: 'Committee cannot make final allocation' })
    .expect(403);
  await request(app)
    .post(`/api/course-preferences/${submitted.body.preference._id}/recommend`)
    .set(auth(hod))
    .send({ course: courses[1].id, note: 'HOD cannot replace committee recommendation' })
    .expect(403);

  const recommended = await request(app)
    .post(`/api/course-preferences/${submitted.body.preference._id}/recommend`)
    .set(auth(committee))
    .send({ course: courses[1].id, note: 'Best match for database specialization' })
    .expect(200);

  expect(recommended.body.preference.status).toBe('RECOMMENDED');
  expect(recommended.body.preference.recommendedCourse.code).toBe('CS202');
  expect(recommended.body.preference.committeeNote).toBe('Best match for database specialization');
  expect(await InstructorAssignment.countDocuments()).toBe(0);

  const finalized = await request(app)
    .post(`/api/course-preferences/${submitted.body.preference._id}/finalize`)
    .set(auth(hod))
    .send({ course: courses[1].id, note: 'Balances expertise and department teaching load' })
    .expect(200);

  expect(finalized.body.preference.status).toBe('FINALIZED');
  expect(finalized.body.preference.confirmedCourse.code).toBe('CS202');
  expect(finalized.body.preference.hodNote).toBe('Balances expertise and department teaching load');
  expect(await InstructorAssignment.exists({ instructor: instructor._id, course: courses[1]._id, semester: semester._id, status: 'DRAFT' })).toBeTruthy();
  const notification = await Notification.findOne({ user: instructor._id, title: 'Your course allocation was finalized' });
  expect(notification.message).toContain('CS202 - Database Systems');
  await request(app).post('/api/assignments').set(auth(hod)).send({
    instructor: secondInstructor.id,
    course: courses[1].id,
    semester: semester.id,
    enrolledStudents: [],
    peerEvaluators: [],
    status: 'DRAFT'
  }).expect(409);

  const ownView = await request(app).get('/api/course-preferences/instructor').set(auth(instructor)).expect(200);
  expect(ownView.body.preferences[0].confirmedCourse.code).toBe('CS202');
  await request(app).post('/api/course-preferences').set(auth(instructor)).send({ semester: semester.id, choices: [courses[3].id] }).expect(409);
  await request(app).post(`/api/course-preferences/${submitted.body.preference._id}/finalize`).set(auth(foreignHod)).send({ course: courses[1].id, note: 'Foreign department attempt' }).expect(404);
});

test('submission is not first come first served and one course can only be finalized once', async () => {
  const first = await request(app).post('/api/course-preferences').set(auth(instructor)).send({
    semester: semester.id,
    choices: [courses[0].id, courses[1].id]
  }).expect(201);
  const second = await request(app).post('/api/course-preferences').set(auth(secondInstructor)).send({
    semester: semester.id,
    choices: [courses[0].id, courses[2].id]
  }).expect(201);

  await request(app).post(`/api/course-preferences/${first.body.preference._id}/recommend`).set(auth(committee)).send({ course: courses[0].id, note: 'Strongest subject expertise' }).expect(200);
  await request(app).post(`/api/course-preferences/${second.body.preference._id}/recommend`).set(auth(committee)).send({ course: courses[0].id, note: 'Also qualified for this course' }).expect(200);
  await request(app).post(`/api/course-preferences/${first.body.preference._id}/finalize`).set(auth(hod)).send({ course: courses[0].id, note: 'Selected after comparing both candidates' }).expect(200);
  await request(app).post(`/api/course-preferences/${second.body.preference._id}/finalize`).set(auth(hod)).send({ course: courses[0].id, note: 'Attempt duplicate final allocation' }).expect(409);
  expect(await CoursePreference.countDocuments({ semester: semester._id, confirmedCourse: courses[0]._id, status: 'FINALIZED' })).toBe(1);
});

test('HOD can reset safe draft allocations while preserving courses and preferences', async () => {
  const submitted = await request(app).post('/api/course-preferences').set(auth(instructor)).send({
    semester: semester.id,
    choices: [courses[0].id, courses[1].id]
  }).expect(201);
  await request(app).post(`/api/course-preferences/${submitted.body.preference._id}/recommend`).set(auth(committee))
    .send({ course: courses[0].id, note: 'Matches instructor specialization' }).expect(200);
  await request(app).post(`/api/course-preferences/${submitted.body.preference._id}/finalize`).set(auth(hod))
    .send({ course: courses[0].id, note: 'Approved after workload review' }).expect(200);

  await InstructorAssignment.updateOne({ instructor: instructor._id, course: courses[0]._id }, { status: 'PUBLISHED' });
  await request(app).post('/api/course-preferences/reset').set(auth(hod))
    .send({ semester: semester.id }).expect(409);
  await InstructorAssignment.updateOne({ instructor: instructor._id, course: courses[0]._id }, { status: 'DRAFT' });

  const reset = await request(app).post('/api/course-preferences/reset').set(auth(hod))
    .send({ semester: semester.id }).expect(200);
  expect(reset.body).toMatchObject({ resetPreferences: 1, removedDraftAssignments: 1 });
  expect(await Course.countDocuments({ semester: semester._id })).toBe(4);
  expect(await InstructorAssignment.countDocuments({ semester: semester._id })).toBe(0);
  const preference = await CoursePreference.findById(submitted.body.preference._id);
  expect(preference.status).toBe('SUBMITTED');
  expect(preference.confirmedCourse).toBeUndefined();
  expect(preference.choices.map(String)).toEqual([courses[0].id, courses[1].id]);
});
