import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../app.js';
import { connectDb, disconnectDb } from '../config/db.js';
import { signAccessToken } from '../utils/tokens.js';
import { User } from '../models/User.js';
import { Department } from '../models/Department.js';
import { Semester } from '../models/Semester.js';
import { Course } from '../models/Course.js';
import { InstructorAssignment } from '../models/InstructorAssignment.js';
import { ExamCommittee } from '../models/ExamCommittee.js';
import { Notification } from '../models/Notification.js';

let mongo;
let app;
let committee;
let department;
let foreignDepartment;
let semester;
let course;
let foreignCourse;
let instructor;
let hod;
let delegatedInstructor;
let admin;
let thirdInstructor;
let foreignInstructor;

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
    Course.deleteMany({}),
    InstructorAssignment.deleteMany({}),
    ExamCommittee.deleteMany({}),
    Notification.deleteMany({})
  ]);

  [department, foreignDepartment] = await Department.create([
    { name: 'Electrical Engineering', code: 'EE', faculty: 'Engineering' },
    { name: 'Civil Engineering', code: 'CE', faculty: 'Engineering' }
  ]);
  const passwordHash = await User.hashPassword('Password123!');
  [committee, instructor, hod, delegatedInstructor, admin, thirdInstructor, foreignInstructor] = await User.create([
    { firstName: 'Exam', lastName: 'Committee', email: 'committee@mtu.edu.et', passwordHash, role: 'EXAM_COMMITTEE', department: department._id },
    { firstName: 'Course', lastName: 'Instructor', email: 'instructor@mtu.edu.et', passwordHash, role: 'INSTRUCTOR', department: department._id },
    { firstName: 'Department', lastName: 'Head', email: 'hod@mtu.edu.et', passwordHash, role: 'HOD', department: department._id },
    { firstName: 'Delegated', lastName: 'Instructor', email: 'delegated@mtu.edu.et', passwordHash, role: 'INSTRUCTOR', department: department._id },
    { firstName: 'System', lastName: 'Admin', email: 'admin@mtu.edu.et', passwordHash, role: 'SUPER_ADMIN' },
    { firstName: 'Third', lastName: 'Instructor', email: 'third@mtu.edu.et', passwordHash, role: 'INSTRUCTOR', department: department._id },
    { firstName: 'Foreign', lastName: 'Instructor', email: 'foreign@mtu.edu.et', passwordHash, role: 'INSTRUCTOR', department: foreignDepartment._id }
  ]);
  semester = await Semester.create({ name: 'Fall', academicYear: '2026/2027', startsAt: new Date('2026-09-01'), endsAt: new Date('2027-01-30'), status: 'OPEN' });
  [course, foreignCourse] = await Course.create([
    { code: 'EE201', title: 'Circuit Analysis', department: department._id, semester: semester._id },
    { code: 'CE230', title: 'Structural Analysis', department: foreignDepartment._id, semester: semester._id }
  ]);
});

test('admin can select any department when creating a course while HOD remains department scoped', async () => {
  const departments = await request(app).get('/api/departments').set(auth(admin)).expect(200);
  expect(departments.body.departments).toHaveLength(2);

  const created = await request(app)
    .post('/api/courses')
    .set(auth(admin))
    .send({ code: 'CE410', title: 'Foundation Engineering', creditHours: 3, department: foreignDepartment.id, semester: semester.id, level: 'Year 4' })
    .expect(201);
  expect(created.body.course.department).toBe(foreignDepartment.id);

  await request(app)
    .post('/api/courses')
    .set(auth(hod))
    .send({ code: 'CE420', title: 'Advanced Structures', creditHours: 3, department: foreignDepartment.id, semester: semester.id, level: 'Year 4' })
    .expect(403);

  const hodCourses = await request(app).get('/api/courses').set(auth(hod)).expect(200);
  expect(hodCourses.body.courses.map((item) => item.code)).toEqual(['EE201']);

  await request(app)
    .post('/api/semesters')
    .set(auth(hod))
    .send({ name: 'Invalid', academicYear: '2027/2028', startsAt: '2028-01-01', endsAt: '2027-01-01', status: 'DRAFT' })
    .expect(400);
});

test('department dashboard totals are scoped while Super Admin sees university totals', async () => {
  const passwordHash = await User.hashPassword('Password123!');
  await User.create([
    { firstName: 'Own', lastName: 'Student', email: 'own.dashboard@mtu.edu.et', passwordHash, role: 'STUDENT', department: department._id, studentNumber: 'EE-DASH-1' },
    { firstName: 'Foreign', lastName: 'Student', email: 'foreign.dashboard@mtu.edu.et', passwordHash, role: 'STUDENT', department: foreignDepartment._id, studentNumber: 'CE-DASH-1' }
  ]);

  const scoped = await request(app).get('/api/dashboard/summary').set(auth(hod)).expect(200);
  expect(scoped.body.totals).toEqual({ departments: 1, courses: 1, students: 1, instructors: 3 });

  const university = await request(app).get('/api/dashboard/summary').set(auth(admin)).expect(200);
  expect(university.body.totals).toEqual({ departments: 2, courses: 2, students: 2, instructors: 4 });
});

test('HOD dashboard receives admin university, department, and direct notifications', async () => {
  await request(app).post('/api/notifications').set(auth(admin))
    .send({ audience: 'UNIVERSITY', type: 'INFO', title: 'University notice', message: 'University-wide announcement for academic leaders.' })
    .expect(201);
  await request(app).post('/api/notifications').set(auth(admin))
    .send({ audience: 'DEPARTMENT', department: department.id, type: 'REMINDER', title: 'Department notice', message: 'Department-specific announcement for the HOD.' })
    .expect(201);
  await request(app).post('/api/notifications').set(auth(admin))
    .send({ audience: 'USER', user: hod.id, type: 'DEADLINE', title: 'Direct HOD notice', message: 'A direct administrator message for this HOD.' })
    .expect(201);
  await request(app).post('/api/notifications').set(auth(admin))
    .send({ audience: 'DEPARTMENT', department: foreignDepartment.id, type: 'INFO', title: 'Foreign notice', message: 'This belongs to another department.' })
    .expect(201);

  const response = await request(app).get('/api/dashboard/summary').set(auth(hod)).expect(200);
  expect(response.body.notifications.map((item) => item.title)).toEqual(expect.arrayContaining(['University notice', 'Department notice', 'Direct HOD notice']));
  expect(response.body.notifications.map((item) => item.title)).not.toContain('Foreign notice');
  expect(response.body.notifications.every((item) => item.sender.role === 'SUPER_ADMIN')).toBe(true);
});

test('managed accounts require the mtu.edu.et email domain', async () => {
  const response = await request(app)
    .post('/api/auth/register')
    .set(auth(admin))
    .send({ firstName: 'External', lastName: 'Account', email: 'external@example.com', password: 'Password123!', role: 'STUDENT', department: department.id, studentNumber: 'EE-EXT-1' })
    .expect(400);
  expect(JSON.stringify(response.body)).toContain('@mtu.edu.et');
});

test('exam committee can add department students and assign them to department courses', async () => {
  const createdStudent = await request(app)
    .post('/api/auth/register')
    .set(auth(committee))
    .send({ firstName: 'New', lastName: 'Student', email: 'new.student@mtu.edu.et', password: 'Password123!', role: 'STUDENT', department: department.id, studentNumber: 'EE-1001' })
    .expect(201);

  await request(app)
    .post('/api/auth/register')
    .set(auth(committee))
    .send({ firstName: 'Other', lastName: 'Student', email: 'other.student@mtu.edu.et', password: 'Password123!', role: 'STUDENT', department: foreignDepartment.id, studentNumber: 'CE-1001' })
    .expect(403);

  await request(app)
    .post('/api/auth/register')
    .set(auth(committee))
    .send({ firstName: 'Fake', lastName: 'Hod', email: 'fake.hod@mtu.edu.et', password: 'Password123!', role: 'HOD', department: department.id, employeeNumber: 'HOD-1001' })
    .expect(403);

  const courses = await request(app).get('/api/courses').set(auth(committee)).expect(200);
  expect(courses.body.courses.map((item) => item.code)).toEqual(['EE201']);

  const assignment = await request(app)
    .post('/api/assignments')
    .set(auth(committee))
    .send({ instructor: instructor.id, course: course.id, semester: semester.id, enrolledStudents: [createdStudent.body.user.id], status: 'PUBLISHED' })
    .expect(201);

  expect(assignment.body.assignment.enrolledStudents).toHaveLength(1);

  await request(app)
    .post('/api/assignments')
    .set(auth(committee))
    .send({ instructor: instructor.id, course: foreignCourse.id, semester: semester.id, enrolledStudents: [createdStudent.body.user.id], status: 'PUBLISHED' })
    .expect(403);
});

test('HOD assigns exactly three department instructors as the semester Exam Committee', async () => {
  await request(app)
    .post('/api/exam-committees')
    .set(auth(hod))
    .send({ semester: semester.id, members: [instructor.id, delegatedInstructor.id], chair: instructor.id })
    .expect(400);

  await request(app)
    .post('/api/exam-committees')
    .set(auth(hod))
    .send({ semester: semester.id, members: [instructor.id, delegatedInstructor.id, foreignInstructor.id], chair: instructor.id })
    .expect(400);

  const created = await request(app)
    .post('/api/exam-committees')
    .set(auth(hod))
    .send({ semester: semester.id, members: [instructor.id, delegatedInstructor.id, thirdInstructor.id], chair: instructor.id })
    .expect(201);

  expect(created.body.committee.members).toHaveLength(3);
  expect(created.body.committee.chair._id).toBe(instructor.id);
  expect(created.body.committee.department._id).toBe(department.id);

  const saved = await request(app).get('/api/exam-committees').set(auth(hod)).expect(200);
  expect(saved.body.committees).toHaveLength(1);
  expect(saved.body.committees[0].semester._id).toBe(semester.id);

  const appointedUsers = await User.find({ _id: { $in: [instructor.id, delegatedInstructor.id, thirdInstructor.id] } });
  expect(appointedUsers.every((user) => user.committeeRoles.includes('EXAM_COMMITTEE'))).toBe(true);

  await request(app)
    .put(`/api/users/${foreignInstructor.id}`)
    .set(auth(admin))
    .send({ firstName: foreignInstructor.firstName, lastName: foreignInstructor.lastName, email: foreignInstructor.email, role: 'INSTRUCTOR', committeeRoles: ['EXAM_COMMITTEE'], department: foreignDepartment.id, isActive: true })
    .expect(400);
});

test('HOD can appoint an instructor committee member who manages the complete evaluation assignment workflow', async () => {
  const appointed = await request(app)
    .put(`/api/users/${delegatedInstructor.id}`)
    .set(auth(hod))
    .send({
      firstName: delegatedInstructor.firstName,
      lastName: delegatedInstructor.lastName,
      email: delegatedInstructor.email,
      role: 'INSTRUCTOR',
      committeeRoles: ['COURSE_COMMITTEE'],
      department: department.id,
      isActive: true
    })
    .expect(200);

  expect(appointed.body.user.role).toBe('INSTRUCTOR');
  expect(appointed.body.user.committeeRoles).toEqual(['COURSE_COMMITTEE']);

  const createdStudent = await request(app)
    .post('/api/auth/register')
    .set(auth(delegatedInstructor))
    .send({ firstName: 'Eligible', lastName: 'Student', email: 'eligible@mtu.edu.et', password: 'Password123!', role: 'STUDENT', department: department.id, studentNumber: 'EE-2001' })
    .expect(201);

  const assignment = await request(app)
    .post('/api/assignments')
    .set(auth(delegatedInstructor))
    .send({
      instructor: instructor.id,
      course: course.id,
      semester: semester.id,
      enrolledStudents: [createdStudent.body.user.id],
      peerEvaluators: [delegatedInstructor.id],
      status: 'PUBLISHED'
    })
    .expect(201);

  expect(assignment.body.assignment.peerEvaluators[0]._id).toBe(delegatedInstructor.id);

  const departmentAssignments = await request(app)
    .get('/api/assignments')
    .set(auth(delegatedInstructor))
    .expect(200);
  expect(departmentAssignments.body.assignments.map((item) => item._id)).toContain(assignment.body.assignment._id);

  await request(app)
    .post('/api/evaluation-keys/generate')
    .set(auth(delegatedInstructor))
    .send({ assignment: assignment.body.assignment._id, expiresAt: new Date(Date.now() + 86400000).toISOString() })
    .expect(201);

  const studentStatus = await request(app)
    .get('/api/evaluations/student/status')
    .set(auth(await User.findById(createdStudent.body.user.id)))
    .expect(200);
  expect(studentStatus.body.courses).toHaveLength(1);

  const peerTargets = await request(app)
    .get('/api/evaluations/targets/PEER')
    .set(auth(delegatedInstructor))
    .expect(200);
  expect(peerTargets.body.targets).toHaveLength(1);

  const hodTargets = await request(app)
    .get('/api/evaluations/targets/HOD')
    .set(auth(hod))
    .expect(200);
  expect(hodTargets.body.targets).toHaveLength(1);
});
