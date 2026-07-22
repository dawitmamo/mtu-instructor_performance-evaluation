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
import { PeerEvaluation, HodEvaluation } from '../models/Evaluations.js';

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
    PeerEvaluation.deleteMany({}),
    HodEvaluation.deleteMany({})
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
  [peerTemplate, hodTemplate] = await EvaluationTemplate.create([
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
  const targets = await request(app)
    .get('/api/evaluations/targets/HOD')
    .set(auth(hod))
    .expect(200);

  expect(targets.body.targets).toHaveLength(1);
  expect(targets.body.targets[0]._id).toBe(ownAssignment.id);

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
});

test('published final summary and notification are visible only on the instructor dashboard', async () => {
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
  expect(dashboard.body.finalReport.publishedBy.role).toBe('HOD');
  expect(dashboard.body.notifications).toHaveLength(2);
  expect(dashboard.body.notifications.map((item) => item.type)).toEqual(expect.arrayContaining(['REPORT', 'REMINDER']));
  expect(dashboard.body.comments).toBeUndefined();
});
