import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectDb, disconnectDb } from '../config/db.js';
import { Department } from '../models/Department.js';
import { Notification } from '../models/Notification.js';
import { Report } from '../models/Report.js';
import { Schedule } from '../models/Schedule.js';
import { Semester } from '../models/Semester.js';
import { User } from '../models/User.js';
import { seedDemoData } from '../services/demoData.js';

let mongo;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await connectDb(mongo.getUri());
});

afterAll(async () => {
  await disconnectDb();
  await mongo.stop();
});

test('reset seeding removes records from feature collections before rebuilding demo data', async () => {
  const department = await Department.create({ name: 'Old Department', code: 'OLD', faculty: 'Old Faculty' });
  const semester = await Semester.create({
    name: 'Old Semester', academicYear: '2000/2001',
    startsAt: new Date('2000-01-01'), endsAt: new Date('2000-06-01')
  });
  const passwordHash = await User.hashPassword('Password123!');
  const [hod, instructor] = await User.create([
    { firstName: 'Old', lastName: 'Head', email: 'old.hod@mtu.edu.et', passwordHash, role: 'HOD', department: department._id },
    { firstName: 'Old', lastName: 'Instructor', email: 'old.instructor@mtu.edu.et', passwordHash, role: 'INSTRUCTOR', department: department._id }
  ]);
  const [notification, schedule, report] = await Promise.all([
    Notification.create({ audience: 'UNIVERSITY', title: 'Stale reset marker', message: 'This record must be removed.' }),
    Schedule.create({ title: 'Stale reset marker', description: 'Old schedule', scheduleType: 'CLASS', department: department._id, semester: semester._id, uploadedBy: hod._id }),
    Report.create({ instructor: instructor._id, semester: semester._id, department: department._id })
  ]);

  await seedDemoData({ reset: true });

  expect(await Notification.findById(notification._id)).toBeNull();
  expect(await Schedule.findById(schedule._id)).toBeNull();
  expect(await Report.findById(report._id)).toBeNull();
  const admin = await User.findOne({ email: 'admin@mtu.edu.et' }).select('+passwordHash');
  expect(admin.role).toBe('SUPER_ADMIN');
  expect(await admin.comparePassword('admin12345')).toBe(true);
  const student = await User.findOne({ email: 'student.alex@mtu.edu.et' }).select('+passwordHash');
  expect(await student.comparePassword('Password123!')).toBe(true);
  expect(await Department.findOne({ code: 'EE' })).toBeNull();
  expect(await Department.findOne({ code: 'ECE' })).toMatchObject({ name: 'Electrical and Computer Engineering' });
});
