import request from 'supertest';
import { createApp } from './app.js';
import { connectDb, disconnectDb } from './config/db.js';
import { Department } from './models/Department.js';
import { User } from './models/User.js';

await connectDb();

try {
  const app = createApp();
  const department = await Department.findOne({ code: 'ECE' });
  if (!department) throw new Error('ECE department is required for the deployment smoke test');

  const accounts = [
    {
      label: 'Super Admin',
      user: await User.findOne({ role: 'SUPER_ADMIN', isActive: true }),
      userType: 'SUPER_ADMIN',
      password: 'admin12345',
      paths: ['/api/dashboard/summary', '/api/departments', '/api/users']
    },
    {
      label: 'HOD',
      user: await User.findOne({ role: 'HOD', department: department._id, isActive: true }),
      userType: 'HOD',
      password: 'Password123!',
      paths: ['/api/dashboard/summary', '/api/users?role=INSTRUCTOR', '/api/assignments', '/api/schedules']
    },
    {
      label: 'Course and Exam Committee',
      user: await User.findOne({ role: 'INSTRUCTOR', department: department._id, committeeRoles: 'COURSE_EXAM_COMMITTEE', isActive: true }),
      userType: 'COURSE_EXAM_COMMITTEE',
      password: 'Password123!',
      paths: ['/api/dashboard/summary', '/api/users?role=STUDENT', '/api/courses', '/api/assignments', '/api/schedules']
    },
    {
      label: 'Instructor',
      user: await User.findOne({ role: 'INSTRUCTOR', department: department._id, committeeRoles: { $ne: 'COURSE_EXAM_COMMITTEE' }, isActive: true }),
      userType: 'INSTRUCTOR',
      password: 'Password123!',
      paths: ['/api/dashboard/instructor', '/api/course-preferences/instructor', '/api/schedules']
    },
    {
      label: 'Student',
      user: await User.findOne({ email: 'student.ece.y3.01@mtu.edu.et', role: 'STUDENT', department: department._id, isActive: true }),
      userType: 'STUDENT',
      password: 'Password123!',
      paths: ['/api/evaluations/student/status', '/api/stream-selection/student', '/api/courses', '/api/schedules']
    }
  ];

  for (const account of accounts) {
    if (!account.user) throw new Error(`${account.label} sample account is missing`);
    const login = await request(app).post('/api/auth/login').send({
      email: account.user.email,
      password: account.password,
      userType: account.userType,
      ...(account.userType === 'SUPER_ADMIN' ? {} : { department: department.id })
    });
    if (login.status !== 200) throw new Error(`${account.label} login failed with status ${login.status}`);
    for (const path of account.paths) {
      const response = await request(app).get(path).set('Authorization', `Bearer ${login.body.accessToken}`);
      if (response.status !== 200) throw new Error(`${account.label} route ${path} failed with status ${response.status}`);
    }
    console.log(`${account.label}: login and ${account.paths.length} critical routes passed`);
  }
} finally {
  await disconnectDb();
}
