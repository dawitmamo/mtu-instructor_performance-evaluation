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
import { EvaluationTemplate } from '../models/EvaluationTemplate.js';
import { StudentEvaluation, PeerEvaluation, HodEvaluation } from '../models/Evaluations.js';
import { Notification } from '../models/Notification.js';
import { Report } from '../models/Report.js';

let mongo;
let app;
let peer;
let hod;
let ownInstructor;
let foreignInstructor;
let ownAssignment;
let foreignAssignment;
let peerTemplate;
let hodTemplate;
let studentTemplate;

function auth(user) {
  return { Authorization: `Bearer ${signAccessToken(user)}` };
}

function responses(question = 'Is prepared') {
  return [{ category: 'Quality', question, score: 4 }];
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
    EvaluationTemplate.deleteMany({}),
    StudentEvaluation.deleteMany({}),
    PeerEvaluation.deleteMany({}),
    HodEvaluation.deleteMany({}),
    Notification.deleteMany({}),
    Report.deleteMany({})
  ]);
  const [ownDepartment, foreignDepartment] = await Department.create([
    { name: 'Computing', code: 'COMP', faculty: 'Engineering' },
    { name: 'Business', code: 'BUS', faculty: 'Management' }
  ]);
  const passwordHash = await User.hashPassword('Password123!');
  [peer, hod] = await User.create([
    { firstName: 'Assigned', lastName: 'Peer', email: 'peer@mtu.edu.et', passwordHash, role: 'INSTRUCTOR', department: ownDepartment._id },
    { firstName: 'Department', lastName: 'Head', email: 'hod@mtu.edu.et', passwordHash, role: 'HOD', department: ownDepartment._id }
  ]);
  [ownInstructor, foreignInstructor] = await User.create([
    { firstName: 'Own', lastName: 'Instructor', email: 'own@mtu.edu.et', passwordHash, role: 'INSTRUCTOR', department: ownDepartment._id },
    { firstName: 'Foreign', lastName: 'Instructor', email: 'foreign@mtu.edu.et', passwordHash, role: 'INSTRUCTOR', department: foreignDepartment._id }
  ]);
  const now = Date.now();
  const semester = await Semester.create({
    name: 'Current',
    academicYear: '2026/2027',
    startsAt: new Date(now - 86400000),
    endsAt: new Date(now + 86400000 * 30),
    evaluationOpensAt: new Date(now - 3600000),
    evaluationClosesAt: new Date(now + 86400000),
    status: 'OPEN'
  });
  const [ownCourse, foreignCourse] = await Course.create([
    { code: 'COMP401', title: 'Systems', department: ownDepartment._id, semester: semester._id },
    { code: 'BUS401', title: 'Finance', department: foreignDepartment._id, semester: semester._id }
  ]);
  [ownAssignment, foreignAssignment] = await InstructorAssignment.create([
    { instructor: ownInstructor._id, course: ownCourse._id, semester: semester._id, peerEvaluators: [peer._id], status: 'PUBLISHED' },
    { instructor: foreignInstructor._id, course: foreignCourse._id, semester: semester._id, status: 'PUBLISHED' }
  ]);
  [studentTemplate, peerTemplate, hodTemplate] = await EvaluationTemplate.create([
    { name: 'Student', kind: 'STUDENT', version: 1, categories: [{ name: 'Quality', questions: [{ text: 'Is prepared', order: 1 }] }] },
    { name: 'Peer', kind: 'PEER', version: 1, categories: [{ name: 'Quality', questions: [{ text: 'Is prepared', order: 1 }] }] },
    { name: 'HOD', kind: 'HOD', version: 1, categories: [{ name: 'Quality', questions: [{ text: 'Is prepared', order: 1 }] }] }
  ]);
});

test('peer evaluation requires an assigned target and the unchanged active template', async () => {
  const unassignedCourse = await Course.create({ code: 'COMP402', title: 'Networks', department: ownInstructor.department, semester: ownAssignment.semester });
  const unassignedSameDepartment = await InstructorAssignment.create({
    instructor: ownInstructor._id,
    course: unassignedCourse._id,
    semester: ownAssignment.semester,
    peerEvaluators: [],
    status: 'PUBLISHED'
  });
  const targets = await request(app).get('/api/evaluations/targets/PEER').set(auth(peer)).expect(200);
  expect(targets.body.targets.map((target) => target._id)).toEqual([ownAssignment.id]);

  await request(app)
    .post('/api/evaluations/peer')
    .set(auth(peer))
    .send({ assignment: unassignedSameDepartment.id, template: peerTemplate.id, responses: responses() })
    .expect(403);

  await request(app)
    .post('/api/evaluations/peer')
    .set(auth(peer))
    .send({ assignment: foreignAssignment.id, template: peerTemplate.id, responses: responses() })
    .expect(403);

  await request(app)
    .post('/api/evaluations/peer')
    .set(auth(peer))
    .send({ assignment: ownAssignment.id, template: peerTemplate.id, responses: responses('Altered question') })
    .expect(400);

  const created = await request(app)
    .post('/api/evaluations/peer')
    .set(auth(peer))
    .send({ assignment: ownAssignment.id, template: peerTemplate.id, responses: responses() })
    .expect(201);

  const evaluation = await PeerEvaluation.findById(created.body.evaluationId).select('+evaluator');
  expect(String(evaluation.instructor)).toBe(String(ownAssignment.instructor));
  expect(String(evaluation.department)).not.toBe('');

  await request(app)
    .post('/api/evaluations/peer')
    .set(auth(peer))
    .send({ assignment: ownAssignment.id, template: peerTemplate.id, responses: responses() })
    .expect(409);
});

test('HOD target listing and submission are restricted to the HOD department', async () => {
  const secondCourse = await Course.create({ code: 'COMP402', title: 'Networks', department: ownInstructor.department, semester: ownAssignment.semester });
  const secondAssignment = await InstructorAssignment.create({
    instructor: ownInstructor._id,
    course: secondCourse._id,
    semester: ownAssignment.semester,
    status: 'PUBLISHED'
  });
  const targets = await request(app)
    .get('/api/evaluations/targets/HOD')
    .set(auth(hod))
    .expect(200);

  expect(targets.body.targets).toHaveLength(2);
  expect(targets.body.targets.map((item) => item._id)).toEqual(expect.arrayContaining([ownAssignment.id, secondAssignment.id]));

  await request(app)
    .post('/api/evaluations/hod')
    .set(auth(hod))
    .send({ assignment: foreignAssignment.id, template: hodTemplate.id, responses: responses() })
    .expect(403);

  await request(app)
    .post('/api/evaluations/hod')
    .set(auth(hod))
    .send({ assignment: ownAssignment.id, template: hodTemplate.id, responses: responses() })
    .expect(201);

  await request(app)
    .post('/api/evaluations/hod')
    .set(auth(hod))
    .send({ assignment: secondAssignment.id, template: hodTemplate.id, responses: responses() })
    .expect(201);
});

test('published assignments notify students and peer evaluators with instructor and course names', async () => {
  const student = await User.create({
    firstName: 'Course', lastName: 'Student', email: 'course.student@mtu.edu.et',
    passwordHash: await User.hashPassword('Password123!'), role: 'STUDENT', department: ownInstructor.department,
    studentNumber: 'COMP-402-01'
  });
  const course = await Course.create({ code: 'COMP402', title: 'Networks', department: ownInstructor.department, semester: ownAssignment.semester });
  const created = await request(app)
    .post('/api/assignments')
    .set(auth(hod))
    .send({
      instructor: ownInstructor.id,
      course: course.id,
      semester: String(ownAssignment.semester),
      enrolledStudents: [student.id],
      peerEvaluators: [peer.id],
      status: 'PUBLISHED'
    })
    .expect(201);

  const notifications = await Notification.find({ relatedAssignment: created.body.assignment._id });
  expect(notifications).toHaveLength(2);
  for (const notification of notifications) {
    expect(notification.title).toContain('Own Instructor');
    expect(notification.message).toContain('COMP402 - Networks');
    expect(notification.type).toBe('EVALUATION');
  }

  const studentStatus = await request(app).get('/api/evaluations/student/status').set(auth(student)).expect(200);
  expect(studentStatus.body.courses[0]).toMatchObject({
    instructor: { firstName: 'Own', lastName: 'Instructor' },
    course: { code: 'COMP402', title: 'Networks' }
  });
  expect(studentStatus.body.notifications[0].message).toContain('Own Instructor');
  expect(studentStatus.body.notifications[0].message).toContain('COMP402 - Networks');

  await request(app).post('/api/evaluations/student').set(auth(student)).send({
    assignment: created.body.assignment._id,
    template: studentTemplate.id,
    responses: responses()
  }).expect(201);
  await request(app).post('/api/evaluations/student').set(auth(student)).send({
    assignment: created.body.assignment._id,
    template: studentTemplate.id,
    responses: responses()
  }).expect(409);
});

test('published final summary and notification are visible only on the instructor dashboard', async () => {
  const assignedStudent = await User.create({
    firstName: 'Assigned', lastName: 'Student', email: 'assigned.student@mtu.edu.et',
    passwordHash: await User.hashPassword('Password123!'), role: 'STUDENT', department: ownInstructor.department,
    studentNumber: 'COMP-401-01', yearLevel: 4, academicStream: 'COMPUTER_ENGINEERING'
  });
  await InstructorAssignment.updateOne({ _id: ownAssignment._id }, { $set: { enrolledStudents: [assignedStudent._id] } });
  const summary = 'Strong teaching performance. Continue peer mentoring and improve assessment turnaround time.';
  await request(app)
    .post(`/api/reports/instructor/${ownInstructor.id}/publish`)
    .set(auth(hod))
    .send({ finalSummary: summary })
    .expect(200);

  await request(app)
    .post('/api/notifications')
    .set(auth(hod))
    .send({ audience: 'DEPARTMENT', type: 'REMINDER', title: 'Department meeting', message: 'Please attend the department review meeting on Friday.' })
    .expect(201);

  const dashboard = await request(app)
    .get('/api/dashboard/instructor')
    .set(auth(ownInstructor))
    .expect(200);

  expect(dashboard.body.finalReport.finalSummary).toBe(summary);
  expect(dashboard.body.finalReport.courseResults[0]).toMatchObject({ courseCode: 'COMP401', courseTitle: 'Systems' });
  expect(dashboard.body.finalReport.publishedBy.role).toBe('HOD');
  expect(dashboard.body.notifications).toHaveLength(2);
  expect(dashboard.body.notifications.map((item) => item.type)).toEqual(expect.arrayContaining(['REPORT', 'REMINDER']));
  expect(dashboard.body.assignedStudents).toHaveLength(1);
  expect(dashboard.body.assignedStudents[0]).toMatchObject({ studentNumber: 'COMP-401-01', academicStream: 'COMPUTER_ENGINEERING' });
  expect(dashboard.body.assignedStudents[0].courses[0].code).toBe('COMP401');
  expect(dashboard.body.comments).toBeUndefined();
});

test('report defaults to the newest semester with evaluations and returns calculated weighted values', async () => {
  const student = await User.create({
    firstName: 'Report', lastName: 'Student', email: 'report.student@mtu.edu.et',
    passwordHash: await User.hashPassword('Password123!'), role: 'STUDENT', department: ownInstructor.department,
    studentNumber: 'COMP-REPORT-01'
  });
  const baseEvaluation = {
    instructor: ownInstructor._id,
    course: ownAssignment.course,
    assignment: ownAssignment._id,
    semester: ownAssignment.semester,
    department: ownInstructor.department
  };
  await Promise.all([
    StudentEvaluation.create({ ...baseEvaluation, student: student._id, template: studentTemplate._id, responses: [{ category: 'Quality', question: 'Is prepared', score: 5 }] }),
    PeerEvaluation.create({ ...baseEvaluation, evaluator: peer._id, template: peerTemplate._id, responses: [{ category: 'Quality', question: 'Is prepared', score: 4 }] }),
    HodEvaluation.create({ ...baseEvaluation, evaluator: hod._id, template: hodTemplate._id, responses: [{ category: 'Quality', question: 'Is prepared', score: 3 }] })
  ]);
  const laterSemester = await Semester.create({
    name: 'Later unrelated semester',
    academicYear: '2027/2028',
    startsAt: new Date(Date.now() + 86400000 * 60),
    endsAt: new Date(Date.now() + 86400000 * 120),
    evaluationOpensAt: new Date(Date.now() + 86400000 * 80),
    evaluationClosesAt: new Date(Date.now() + 86400000 * 100),
    status: 'PLANNED'
  });
  const laterCourse = await Course.create({
    code: 'COMP501', title: 'Future Systems', department: ownInstructor.department, semester: laterSemester._id
  });
  await InstructorAssignment.create({
    instructor: ownInstructor._id,
    course: laterCourse._id,
    semester: laterSemester._id,
    status: 'DRAFT'
  });

  const response = await request(app)
    .get(`/api/reports/instructor/${ownInstructor.id}`)
    .set(auth(hod))
    .expect(200);

  expect(response.body.semester._id).toBe(String(ownAssignment.semester));
  expect(response.body.semester._id).not.toBe(laterSemester.id);
  expect(response.body.availableSemesters.map((item) => item._id)).toEqual([laterSemester.id, String(ownAssignment.semester)]);
  expect(response.body.evaluationCounts).toEqual({ student: 1, peer: 1, hod: 1, total: 3 });
  expect(response.body.scores).toMatchObject({
    studentScore: 5,
    studentWeighted: 2,
    peerScore: 4,
    peerWeighted: 1.2,
    hodScore: 3,
    hodWeighted: 0.9,
    overall: 4.1
  });
  expect(response.body.courseResults[0].finalScore).toBe(4.1);
});

test('CSV report exports neutralize spreadsheet formulas in user-controlled cells', async () => {
  ownInstructor.firstName = '=2+2';
  ownInstructor.lastName = 'Bad"\r\nInjected';
  await ownInstructor.save();

  const response = await request(app)
    .get(`/api/reports/instructor/${ownInstructor.id}/excel`)
    .set(auth(hod))
    .expect('Content-Type', /text\/csv/)
    .expect(200);

  expect(response.text).toContain("Instructor,\"'=2+2 Bad\"\"\r\nInjected\"");
  expect(response.headers['content-disposition']).toBe('attachment; filename="Bad_Injected-evaluation.csv"');
});
