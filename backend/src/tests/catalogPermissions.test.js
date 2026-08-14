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
import { EmailDelivery } from '../models/EmailDelivery.js';

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
    Notification.deleteMany({}),
    EmailDelivery.deleteMany({})
  ]);

  [department, foreignDepartment] = await Department.create([
    { name: 'Mechanical Engineering', code: 'ME', faculty: 'Engineering' },
    { name: 'Civil Engineering', code: 'CE', faculty: 'Engineering' }
  ]);
  const passwordHash = await User.hashPassword('Password123!');
  [committee, instructor, hod, delegatedInstructor, admin, thirdInstructor, foreignInstructor] = await User.create([
    { firstName: 'Course Exam', lastName: 'Committee', email: 'committee@mtu.edu.et', passwordHash, role: 'INSTRUCTOR', department: department._id },
    { firstName: 'Course', lastName: 'Instructor', email: 'instructor@mtu.edu.et', passwordHash, role: 'INSTRUCTOR', department: department._id },
    { firstName: 'Department', lastName: 'Head', email: 'hod@mtu.edu.et', passwordHash, role: 'HOD', department: department._id },
    { firstName: 'Delegated', lastName: 'Instructor', email: 'delegated@mtu.edu.et', passwordHash, role: 'INSTRUCTOR', department: department._id },
    { firstName: 'System', lastName: 'Admin', email: 'admin@mtu.edu.et', passwordHash, role: 'SUPER_ADMIN' },
    { firstName: 'Third', lastName: 'Instructor', email: 'third@mtu.edu.et', passwordHash, role: 'INSTRUCTOR', department: department._id },
    { firstName: 'Foreign', lastName: 'Instructor', email: 'foreign@mtu.edu.et', passwordHash, role: 'INSTRUCTOR', department: foreignDepartment._id }
  ]);
  semester = await Semester.create({ name: 'Fall', academicYear: '2026/2027', startsAt: new Date('2026-09-01'), endsAt: new Date('2027-01-30'), status: 'OPEN' });
  [course, foreignCourse] = await Course.create([
    { code: 'ME201', title: 'Engineering Analysis', department: department._id, semester: semester._id },
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
  expect(hodCourses.body.courses.map((item) => item.code)).toEqual(['ME201']);

  await request(app)
    .post('/api/semesters')
    .set(auth(hod))
    .send({ name: 'Invalid', academicYear: '2027/2028', startsAt: '2028-01-01', endsAt: '2027-01-01', status: 'DRAFT' })
    .expect(400);
});

test('department dashboard totals are scoped while Super Admin sees university totals', async () => {
  const passwordHash = await User.hashPassword('Password123!');
  await User.create([
    { firstName: 'Own', lastName: 'Student', email: 'own.dashboard@mtu.edu.et', passwordHash, role: 'STUDENT', department: department._id, studentNumber: 'ME-DASH-1' },
    { firstName: 'Foreign', lastName: 'Student', email: 'foreign.dashboard@mtu.edu.et', passwordHash, role: 'STUDENT', department: foreignDepartment._id, studentNumber: 'CE-DASH-1' }
  ]);

  const scoped = await request(app).get('/api/dashboard/summary').set(auth(hod)).expect(200);
  expect(scoped.body.totals).toEqual({ departments: 1, courses: 1, students: 1, instructors: 4 });

  const university = await request(app).get('/api/dashboard/summary').set(auth(admin)).expect(200);
  expect(university.body.totals).toEqual({ departments: 2, courses: 2, students: 2, instructors: 5 });
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
    .send({ firstName: 'External', lastName: 'Account', email: 'external@example.com', role: 'STUDENT', department: department.id, studentNumber: 'ME-EXT-1' })
    .expect(400);
  expect(JSON.stringify(response.body)).toContain('@mtu.edu.et');
});

test('HOD manages only instructors and students in the HOD department', async () => {
  await request(app).post('/api/auth/register').set(auth(hod)).send({
    firstName: 'Another', lastName: 'Head', username: 'another.hod', email: 'another.hod@mtu.edu.et', role: 'HOD', department: department.id, employeeNumber: 'HOD-2001'
  }).expect(403);

  await request(app).post('/api/auth/register').set(auth(hod)).send({
    firstName: 'Foreign', lastName: 'Student', username: 'foreign.student', email: 'foreign.student@mtu.edu.et', role: 'STUDENT', department: foreignDepartment.id, studentNumber: 'CE-2001'
  }).expect(403);

  const created = await request(app).post('/api/auth/register').set(auth(hod)).send({
    firstName: 'Department', lastName: 'Instructor', username: 'department.instructor', email: 'department.instructor@mtu.edu.et', role: 'INSTRUCTOR', department: department.id, employeeNumber: 'ME-2001'
  }).expect(201);
  expect(created.body.user.username).toBe('department.instructor');
  await request(app).post('/api/auth/login').send({ email: 'department.instructor@mtu.edu.et', password: 'Password123!', userType: 'INSTRUCTOR' }).expect(401);
  const setup = await request(app).post('/api/auth/forgot-password').send({ email: 'department.instructor@mtu.edu.et' }).expect(200);
  await request(app).post('/api/auth/reset-password').send({ token: setup.body.resetToken, newPassword: 'DepartmentPassword123!' }).expect(200);
  await request(app).post('/api/auth/login').send({ email: 'department.instructor@mtu.edu.et', password: 'DepartmentPassword123!', userType: 'INSTRUCTOR' }).expect(200);
});

test('HOD and Super Admin send audited setup links instead of assigning passwords', async () => {
  const updatePayload = (user, password) => ({
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    password,
    role: user.role,
    committeeRoles: user.committeeRoles || [],
    department: user.department ? String(user.department) : undefined,
    employeeNumber: user.employeeNumber || undefined,
    isActive: true
  });

  await request(app).put(`/api/users/${instructor.id}`).set(auth(hod))
    .send(updatePayload(instructor, 'HodReset123!')).expect(400);
  await request(app).post('/api/auth/login')
    .send({ email: instructor.email, password: 'Password123!', userType: 'INSTRUCTOR' }).expect(200);

  await request(app).post(`/api/users/${instructor.id}/setup-link`).set(auth(hod)).expect(200);
  await request(app).post(`/api/users/${foreignInstructor.id}/setup-link`).set(auth(hod)).expect(403);
  await request(app).post(`/api/users/${foreignInstructor.id}/setup-link`).set(auth(admin)).expect(200);

  await request(app).put(`/api/users/${foreignInstructor.id}`).set(auth(admin))
    .send(updatePayload(foreignInstructor, 'AdminReset123!')).expect(400);
  await request(app).post('/api/auth/login')
    .send({ email: foreignInstructor.email, password: 'Password123!', userType: 'INSTRUCTOR' }).expect(200);
});

test('exam committee cannot manage users but can assign HOD-created students to courses', async () => {
  await request(app)
    .post('/api/exam-committees')
    .set(auth(hod))
    .send({ semester: semester.id, members: [committee.id, instructor.id, delegatedInstructor.id], chair: committee.id })
    .expect(201);

  await request(app)
    .post('/api/auth/register')
    .set(auth(committee))
    .send({ firstName: 'New', lastName: 'Student', email: 'new.student@mtu.edu.et', role: 'STUDENT', department: department.id, studentNumber: 'ME-1001' })
    .expect(403);

  const createdStudent = await request(app)
    .post('/api/auth/register')
    .set(auth(hod))
    .send({ firstName: 'New', lastName: 'Student', username: 'new.student', email: 'new.student@mtu.edu.et', role: 'STUDENT', department: department.id, studentNumber: 'ME-1001' })
    .expect(201);

  await request(app)
    .post('/api/auth/register')
    .set(auth(committee))
    .send({ firstName: 'Other', lastName: 'Student', email: 'other.student@mtu.edu.et', role: 'STUDENT', department: foreignDepartment.id, studentNumber: 'CE-1001' })
    .expect(403);

  await request(app)
    .post('/api/auth/register')
    .set(auth(committee))
    .send({ firstName: 'Fake', lastName: 'Hod', email: 'fake.hod@mtu.edu.et', role: 'HOD', department: department.id, employeeNumber: 'HOD-1001' })
    .expect(403);

  const courses = await request(app).get('/api/courses').set(auth(committee)).expect(200);
  expect(courses.body.courses.map((item) => item.code)).toEqual(['ME201']);

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

test('HOD assigns exactly three department instructors as one Course and Exam Committee', async () => {
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
  expect(appointedUsers.every((user) => user.committeeRoles.includes('COURSE_EXAM_COMMITTEE'))).toBe(true);
  const appointmentNotifications = await Notification.find({ title: 'Course and Exam Committee appointment' });
  expect(appointmentNotifications).toHaveLength(3);
  expect(appointmentNotifications.find((item) => String(item.user) === instructor.id)?.message).toMatch(/chair/i);
  expect(await EmailDelivery.countDocuments({ notification: { $in: appointmentNotifications.map((item) => item._id) } })).toBe(3);

  await request(app)
    .put(`/api/users/${foreignInstructor.id}`)
    .set(auth(admin))
    .send({ firstName: foreignInstructor.firstName, lastName: foreignInstructor.lastName, email: foreignInstructor.email, role: 'INSTRUCTOR', committeeRoles: ['COURSE_EXAM_COMMITTEE'], department: foreignDepartment.id, isActive: true })
    .expect(400);
});

test('HOD manages users while an appointed committee member manages the evaluation assignment workflow', async () => {
  await request(app)
    .post('/api/exam-committees')
    .set(auth(hod))
    .send({ semester: semester.id, members: [instructor.id, delegatedInstructor.id, thirdInstructor.id], chair: delegatedInstructor.id })
    .expect(201);

  const appointed = await User.findById(delegatedInstructor.id);
  expect(appointed.role).toBe('INSTRUCTOR');
  expect(appointed.committeeRoles).toEqual(['COURSE_EXAM_COMMITTEE']);

  const committeeDashboard = await request(app)
    .get('/api/dashboard/summary')
    .set(auth(delegatedInstructor))
    .expect(200);
  expect(committeeDashboard.body.totals.departments).toBe(1);

  await request(app)
    .post('/api/auth/register')
    .set(auth(delegatedInstructor))
    .send({ firstName: 'Eligible', lastName: 'Student', email: 'eligible@mtu.edu.et', role: 'STUDENT', department: department.id, studentNumber: 'ME-2001' })
    .expect(403);
  const hodCreatedStudent = await request(app)
    .post('/api/auth/register')
    .set(auth(hod))
    .send({ firstName: 'Eligible', lastName: 'Student', username: 'eligible.student', email: 'eligible@mtu.edu.et', role: 'STUDENT', department: department.id, studentNumber: 'ME-2001' })
    .expect(201);

  const assignment = await request(app)
    .post('/api/assignments')
    .set(auth(delegatedInstructor))
    .send({
      instructor: instructor.id,
      course: course.id,
      semester: semester.id,
      enrolledStudents: [hodCreatedStudent.body.user.id],
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

  const departmentInstructors = await request(app)
    .get('/api/users?role=INSTRUCTOR')
    .set(auth(delegatedInstructor))
    .expect(200);
  expect(departmentInstructors.body.users.map((item) => item._id)).toContain(instructor.id);
  expect(departmentInstructors.body.users.map((item) => item._id)).not.toContain(foreignInstructor.id);

  const departmentStudents = await request(app)
    .get('/api/users?role=STUDENT')
    .set(auth(delegatedInstructor))
    .expect(200);
  expect(departmentStudents.body.users.map((item) => item._id)).toContain(hodCreatedStudent.body.user.id);

  const studentStatus = await request(app)
    .get('/api/evaluations/student/status')
    .set(auth(await User.findById(hodCreatedStudent.body.user.id)))
    .expect(200);
  expect(studentStatus.body.courses).toHaveLength(1);

  await request(app)
    .post('/api/evaluation-keys/generate')
    .set(auth(delegatedInstructor))
    .send({ assignment: assignment.body.assignment._id, expiresAt: new Date(Date.now() + 86400000).toISOString() })
    .expect(404);

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

test('HOD and Course and Exam Committee can assign an instructor to an entire student class', async () => {
  await request(app)
    .post('/api/exam-committees')
    .set(auth(hod))
    .send({ semester: semester.id, members: [committee.id, delegatedInstructor.id, thirdInstructor.id], chair: committee.id })
    .expect(201);

  const passwordHash = await User.hashPassword('Password123!');
  const [yearThreeA, yearThreeB, yearTwo] = await User.create([
    { firstName: 'Year Three', lastName: 'Alpha', email: 'year3.alpha@mtu.edu.et', passwordHash, role: 'STUDENT', department: department._id, studentNumber: 'ME-Y3-1', yearLevel: 3 },
    { firstName: 'Year Three', lastName: 'Beta', email: 'year3.beta@mtu.edu.et', passwordHash, role: 'STUDENT', department: department._id, studentNumber: 'ME-Y3-2', yearLevel: 3 },
    { firstName: 'Year Two', lastName: 'Student', email: 'year2.student@mtu.edu.et', passwordHash, role: 'STUDENT', department: department._id, studentNumber: 'ME-Y2-1', yearLevel: 2 }
  ]);
  const [hodCourse, committeeCourse] = await Course.create([
    { code: 'ME301', title: 'Engineering Signals', department: department._id, semester: semester._id, yearLevel: 3 },
    { code: 'ME302', title: 'Engineering Systems', department: department._id, semester: semester._id, yearLevel: 3 }
  ]);
  const courseAssignmentPayload = (selectedCourse) => ({
    instructor: instructor.id,
    course: selectedCourse.id,
    semester: semester.id,
    enrollmentMode: 'INDIVIDUAL',
    enrolledStudents: [],
    peerEvaluators: [],
    status: 'DRAFT'
  });
  const cohortPayload = (selectedCourse) => ({
    instructor: instructor.id,
    course: selectedCourse.id,
    semester: semester.id,
    enrollmentMode: 'COHORT',
    studentCohort: { yearLevel: 3 },
    enrolledStudents: [],
    peerEvaluators: [],
    status: 'PUBLISHED'
  });

  const hodCourseAssignment = await request(app).post('/api/assignments').set(auth(hod)).send(courseAssignmentPayload(hodCourse)).expect(201);
  const committeeCourseAssignment = await request(app).post('/api/assignments').set(auth(committee)).send(courseAssignmentPayload(committeeCourse)).expect(201);
  expect(hodCourseAssignment.body.assignment.status).toBe('DRAFT');
  expect(committeeCourseAssignment.body.assignment.status).toBe('DRAFT');
  expect(hodCourseAssignment.body.assignment.enrolledStudents).toHaveLength(0);
  expect(committeeCourseAssignment.body.assignment.enrolledStudents).toHaveLength(0);

  const hodAssignment = await request(app).put(`/api/assignments/${hodCourseAssignment.body.assignment._id}`).set(auth(committee)).send(cohortPayload(hodCourse)).expect(200);
  const committeeAssignment = await request(app).put(`/api/assignments/${committeeCourseAssignment.body.assignment._id}`).set(auth(hod)).send(cohortPayload(committeeCourse)).expect(200);

  for (const response of [hodAssignment, committeeAssignment]) {
    expect(response.body.assignment.enrollmentMode).toBe('COHORT');
    expect(response.body.assignment.studentCohort.yearLevel).toBe(3);
    expect(response.body.assignment.enrolledStudents.map((student) => student._id)).toEqual(expect.arrayContaining([yearThreeA.id, yearThreeB.id]));
    expect(response.body.assignment.enrolledStudents.map((student) => student._id)).not.toContain(yearTwo.id);
  }
});

test('instructors cannot override assignment scoping through query parameters', async () => {
  const [ownAssignment, otherAssignment] = await InstructorAssignment.create([
    { instructor: instructor._id, course: course._id, semester: semester._id, status: 'PUBLISHED' },
    { instructor: foreignInstructor._id, course: foreignCourse._id, semester: semester._id, status: 'PUBLISHED' }
  ]);

  const response = await request(app)
    .get(`/api/assignments?instructor=${foreignInstructor.id}`)
    .set(auth(instructor))
    .expect(200);

  expect(response.body.assignments.map((assignment) => assignment._id)).toEqual([ownAssignment.id]);
  expect(response.body.assignments.map((assignment) => assignment._id)).not.toContain(otherAssignment.id);
});

test('instructor-only dashboard and report endpoints reject other account roles', async () => {
  const passwordHash = await User.hashPassword('Password123!');
  const student = await User.create({
    firstName: 'Private',
    lastName: 'Student',
    email: 'private.student@mtu.edu.et',
    passwordHash,
    role: 'STUDENT',
    department: department._id,
    studentNumber: 'ME-PRIVATE-1'
  });

  await request(app).get(`/api/dashboard/instructor/${student.id}`).set(auth(hod)).expect(404);
  await request(app).get(`/api/reports/instructor/${hod.id}`).set(auth(admin)).expect(404);
});

test('students only see courses in their own department even when another department is requested', async () => {
  const passwordHash = await User.hashPassword('Password123!');
  const student = await User.create({
    firstName: 'Scoped',
    lastName: 'Student',
    email: 'scoped.student@mtu.edu.et',
    passwordHash,
    role: 'STUDENT',
    department: department._id,
    studentNumber: 'ME-SCOPED-1'
  });

  const response = await request(app)
    .get(`/api/courses?department=${foreignDepartment.id}`)
    .set(auth(student))
    .expect(200);

  expect(response.body.courses.map((item) => item.code)).toEqual(['ME201']);
  expect(response.body.courses.every((item) => item.department._id === department.id)).toBe(true);
});

test('an unappointed instructor with a stale committee flag is denied and corrected', async () => {
  const passwordHash = await User.hashPassword('Password123!');
  const staleInstructor = await User.create({
    firstName: 'Stale',
    lastName: 'Committee',
    email: 'stale.committee@mtu.edu.et',
    passwordHash,
    role: 'INSTRUCTOR',
    committeeRoles: ['COURSE_EXAM_COMMITTEE'],
    department: department._id
  });

  await request(app).get('/api/users').set(auth(staleInstructor)).expect(403);
  const refreshed = await User.findById(staleInstructor.id);
  expect(refreshed.committeeRoles).toEqual([]);
});

test('Super Admin can appoint and view a selected department committee while HOD stays scoped', async () => {
  const passwordHash = await User.hashPassword('Password123!');
  const [secondForeign, thirdForeign] = await User.create([
    { firstName: 'Second', lastName: 'Foreign', email: 'second.foreign@mtu.edu.et', passwordHash, role: 'INSTRUCTOR', department: foreignDepartment._id },
    { firstName: 'Third', lastName: 'Foreign', email: 'third.foreign@mtu.edu.et', passwordHash, role: 'INSTRUCTOR', department: foreignDepartment._id }
  ]);

  await request(app)
    .post('/api/exam-committees')
    .set(auth(hod))
    .send({ department: foreignDepartment.id, semester: semester.id, members: [foreignInstructor.id, secondForeign.id, thirdForeign.id], chair: foreignInstructor.id })
    .expect(403);

  const created = await request(app)
    .post('/api/exam-committees')
    .set(auth(admin))
    .send({ department: foreignDepartment.id, semester: semester.id, members: [foreignInstructor.id, secondForeign.id, thirdForeign.id], chair: foreignInstructor.id })
    .expect(201);

  expect(created.body.committee.department._id).toBe(foreignDepartment.id);
  expect(created.body.committee.appointedBy.email).toBe(admin.email);

  const listed = await request(app).get('/api/exam-committees').set(auth(admin)).expect(200);
  const savedCommittee = listed.body.committees.find((item) => item.department._id === foreignDepartment.id);
  expect(savedCommittee.members.map((member) => member.email)).toEqual(expect.arrayContaining([foreignInstructor.email, secondForeign.email, thirdForeign.email]));
  const hodList = await request(app).get('/api/exam-committees').set(auth(hod)).expect(200);
  expect(hodList.body.committees).toEqual([]);
});
