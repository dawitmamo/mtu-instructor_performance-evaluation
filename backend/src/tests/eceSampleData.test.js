import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectDb, disconnectDb } from '../config/db.js';
import { Course } from '../models/Course.js';
import { Department } from '../models/Department.js';
import { ExamCommittee } from '../models/ExamCommittee.js';
import { InstructorAssignment } from '../models/InstructorAssignment.js';
import { User } from '../models/User.js';
import { seedEceSampleData } from '../services/eceSampleData.js';
import { StreamSelectionRound } from '../models/StreamSelectionRound.js';
import { Schedule } from '../models/Schedule.js';

let mongo;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await connectDb(mongo.getUri());
});

afterAll(async () => {
  await disconnectDb();
  await mongo.stop();
});

test('ECE seed is idempotent and creates four ten-student year cohorts with assignments and a three-member Course and Exam Committee', async () => {
  await seedEceSampleData();
  await seedEceSampleData();

  const department = await Department.findOne({ code: 'ECE' });
  expect(department.name).toBe('Electrical and Computer Engineering');

  for (const yearLevel of [2, 3, 4, 5]) {
    expect(await User.countDocuments({ role: 'STUDENT', department: department._id, yearLevel })).toBe(10);
  }
  expect(await User.countDocuments({ role: 'STUDENT', department: department._id, yearLevel: { $in: [4, 5] }, academicStream: { $exists: true } })).toBe(20);
  const yearThreeStudents = await User.find({ role: 'STUDENT', department: department._id, yearLevel: 3 });
  expect(yearThreeStudents).toHaveLength(10);
  expect(yearThreeStudents.every((student) => typeof student.gpa === 'number' && student.gpa >= 0 && student.gpa <= 4)).toBe(true);
  const eceInstructors = await User.find({ role: 'INSTRUCTOR', department: department._id });
  expect(eceInstructors.every((instructor) => Boolean(instructor.academicStream))).toBe(true);

  const courses = await Course.find({ department: department._id, yearLevel: { $in: [2, 3, 4, 5] } });
  expect(courses).toHaveLength(12);
  const assignments = await InstructorAssignment.find({ course: { $in: courses.map((course) => course._id) } });
  expect(assignments).toHaveLength(12);
  expect(assignments.every((assignment) => assignment.enrolledStudents.length >= 2 && assignment.peerEvaluators.length === 1 && assignment.status === 'PUBLISHED')).toBe(true);
  for (const assignment of assignments) {
    const course = courses.find((item) => item.id === String(assignment.course));
    const students = await User.find({ _id: { $in: assignment.enrolledStudents } });
    expect(students.every((student) => student.yearLevel === course.yearLevel && (!course.academicStream || student.academicStream === course.academicStream))).toBe(true);
  }

  const committee = await ExamCommittee.findOne({ department: department._id });
  expect(committee.members).toHaveLength(3);
  expect(new Set(committee.members.map(String)).size).toBe(3);
  const members = await User.find({ _id: { $in: committee.members } });
  expect(members.every((member) => member.role === 'INSTRUCTOR' && member.committeeRoles.includes('COURSE_EXAM_COMMITTEE'))).toBe(true);

  const selectionRound = await StreamSelectionRound.findOne({ department: department._id }).populate('semester');
  expect(selectionRound.semester.name).toBe('Second Semester');
  expect(selectionRound.status).toBe('OPEN');
  expect(selectionRound.capacities).toHaveLength(4);
  expect(selectionRound.capacities.reduce((total, item) => total + item.seats, 0)).toBe(10);
  expect(await ExamCommittee.countDocuments({ department: department._id })).toBe(2);
  expect(await Schedule.countDocuments({ department: department._id, status: 'PUBLISHED' })).toBe(1);
});
