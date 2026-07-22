import bcrypt from 'bcryptjs';
import { Department } from '../models/Department.js';
import { Semester } from '../models/Semester.js';
import { Course } from '../models/Course.js';
import { User } from '../models/User.js';
import { InstructorAssignment } from '../models/InstructorAssignment.js';
import { EvaluationTemplate } from '../models/EvaluationTemplate.js';
import { EvaluationKey } from '../models/EvaluationKey.js';
import { evaluationScale, evaluationTemplates } from '../utils/evaluationTemplate.js';
import { seedEceSampleData } from './eceSampleData.js';

function buildTemplate(kind, template) {
  return {
    kind,
    name: template.name,
    description: template.description,
    version: 1,
    isActive: true,
    scale: evaluationScale,
    categories: template.categories.map((category) => ({
      name: category.name,
      questions: category.questions.map((text, index) => ({ text, order: index + 1 }))
    }))
  };
}

async function upsertDepartment({ code, name, faculty }) {
  return Department.findOneAndUpdate(
    { code },
    { code, name, faculty },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );
}

async function upsertUser({ email, passwordHash, ...payload }) {
  return User.findOneAndUpdate(
    { email },
    { ...payload, email, passwordHash, isEmailVerified: true, isActive: true },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );
}

async function upsertCourse({ code, semester, ...payload }) {
  return Course.findOneAndUpdate(
    { code, semester },
    { code, semester, ...payload },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );
}

async function upsertAssignment({ instructor, course, semester, enrolledStudents, assignedBy, status = 'PUBLISHED' }) {
  return InstructorAssignment.findOneAndUpdate(
    { instructor, course, semester },
    { instructor, course, semester, enrolledStudents, assignedBy, status },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );
}

export async function seedEvaluationTemplates() {
  await Promise.all(Object.entries(evaluationTemplates).map(([kind, template]) =>
    EvaluationTemplate.findOneAndUpdate(
      { kind, version: 1 },
      buildTemplate(kind, template),
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    )
  ));
}

export async function seedDemoPeerAssignments() {
  const [ada, kojo, softwareEngineering, databaseSystems] = await Promise.all([
    User.findOne({ email: 'instructor.ada@mtu.edu.et' }),
    User.findOne({ email: 'instructor.kojo@mtu.edu.et' }),
    Course.findOne({ code: 'CS401' }),
    Course.findOne({ code: 'CS305' })
  ]);
  if (ada && kojo && softwareEngineering) {
    await InstructorAssignment.findOneAndUpdate(
      { instructor: ada._id, course: softwareEngineering._id },
      { $addToSet: { peerEvaluators: kojo._id } },
      { new: true }
    );
  }
  if (ada && kojo && databaseSystems) {
    await InstructorAssignment.findOneAndUpdate(
      { instructor: kojo._id, course: databaseSystems._id },
      { $addToSet: { peerEvaluators: ada._id } },
      { new: true }
    );
  }
}

export async function seedSampleAcademicData() {
  const passwordHash = await User.hashPassword('Password123!');
  const semester = await Semester.findOneAndUpdate(
    { name: 'Fall Semester', academicYear: '2026/2027' },
    {
      name: 'Fall Semester',
      academicYear: '2026/2027',
      startsAt: new Date('2026-09-01'),
      endsAt: new Date('2026-12-20'),
      evaluationOpensAt: new Date('2026-07-01'),
      evaluationClosesAt: new Date('2026-12-15'),
      status: 'OPEN'
    },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );

  const admin = await User.findOne({ email: 'admin@mtu.edu.et' });
  const departments = await Promise.all([
    upsertDepartment({ code: 'CS', name: 'Computer Science', faculty: 'Engineering and Technology' }),
    upsertDepartment({ code: 'EE', name: 'Electrical Engineering', faculty: 'Engineering and Technology' }),
    upsertDepartment({ code: 'ME', name: 'Mechanical Engineering', faculty: 'Engineering and Technology' }),
    upsertDepartment({ code: 'CE', name: 'Civil Engineering', faculty: 'Engineering and Technology' }),
    upsertDepartment({ code: 'IT', name: 'Information Technology', faculty: 'Computing and Informatics' })
  ]);
  const byCode = new Map(departments.map((department) => [department.code, department]));

  const users = await Promise.all([
    upsertUser({ firstName: 'Nadia', lastName: 'Head', email: 'hod.cs@mtu.edu.et', passwordHash, role: 'HOD', department: byCode.get('CS')._id, employeeNumber: 'HOD-CS-001' }),
    upsertUser({ firstName: 'Elena', lastName: 'Bekele', email: 'hod.ee@mtu.edu.et', passwordHash, role: 'HOD', department: byCode.get('EE')._id, employeeNumber: 'HOD-EE-001' }),
    upsertUser({ firstName: 'Mekonnen', lastName: 'Tadesse', email: 'hod.me@mtu.edu.et', passwordHash, role: 'HOD', department: byCode.get('ME')._id, employeeNumber: 'HOD-ME-001' }),
    upsertUser({ firstName: 'Sara', lastName: 'Kebede', email: 'hod.ce@mtu.edu.et', passwordHash, role: 'HOD', department: byCode.get('CE')._id, employeeNumber: 'HOD-CE-001' }),
    upsertUser({ firstName: 'Helen', lastName: 'Tesfaye', email: 'hod.it@mtu.edu.et', passwordHash, role: 'HOD', department: byCode.get('IT')._id, employeeNumber: 'HOD-IT-001' }),
    upsertUser({ firstName: 'Sam', lastName: 'Committee', email: 'committee.cs@mtu.edu.et', passwordHash, role: 'EXAM_COMMITTEE', department: byCode.get('CS')._id, employeeNumber: 'COM-CS-001' }),
    upsertUser({ firstName: 'Dawit', lastName: 'Committee', email: 'committee.engineering@mtu.edu.et', passwordHash, role: 'EXAM_COMMITTEE', department: byCode.get('EE')._id, employeeNumber: 'COM-ENG-001' }),
    upsertUser({ firstName: 'Ada', lastName: 'Mensah', email: 'instructor.ada@mtu.edu.et', passwordHash, role: 'INSTRUCTOR', department: byCode.get('CS')._id, employeeNumber: 'INS-CS-001' }),
    upsertUser({ firstName: 'Kojo', lastName: 'Annan', email: 'instructor.kojo@mtu.edu.et', passwordHash, role: 'INSTRUCTOR', committeeRoles: ['COURSE_COMMITTEE'], department: byCode.get('CS')._id, employeeNumber: 'INS-CS-002' }),
    upsertUser({ firstName: 'Abel', lastName: 'Bekele', email: 'instructor.abel.cs@mtu.edu.et', passwordHash, role: 'INSTRUCTOR', department: byCode.get('CS')._id, employeeNumber: 'INS-CS-003' }),
    upsertUser({ firstName: 'Meron', lastName: 'Alemu', email: 'instructor.meron.ee@mtu.edu.et', passwordHash, role: 'INSTRUCTOR', department: byCode.get('EE')._id, employeeNumber: 'INS-EE-001' }),
    upsertUser({ firstName: 'Yonas', lastName: 'Fikru', email: 'instructor.yonas.ee@mtu.edu.et', passwordHash, role: 'INSTRUCTOR', department: byCode.get('EE')._id, employeeNumber: 'INS-EE-002' }),
    upsertUser({ firstName: 'Samuel', lastName: 'Wolde', email: 'instructor.samuel.me@mtu.edu.et', passwordHash, role: 'INSTRUCTOR', department: byCode.get('ME')._id, employeeNumber: 'INS-ME-001' }),
    upsertUser({ firstName: 'Ruth', lastName: 'Girma', email: 'instructor.ruth.me@mtu.edu.et', passwordHash, role: 'INSTRUCTOR', department: byCode.get('ME')._id, employeeNumber: 'INS-ME-002' }),
    upsertUser({ firstName: 'Bekele', lastName: 'Hailu', email: 'instructor.bekele.ce@mtu.edu.et', passwordHash, role: 'INSTRUCTOR', department: byCode.get('CE')._id, employeeNumber: 'INS-CE-001' }),
    upsertUser({ firstName: 'Liya', lastName: 'Desta', email: 'instructor.liya.ce@mtu.edu.et', passwordHash, role: 'INSTRUCTOR', department: byCode.get('CE')._id, employeeNumber: 'INS-CE-002' }),
    upsertUser({ firstName: 'Tigist', lastName: 'Abebe', email: 'instructor.tigist.it@mtu.edu.et', passwordHash, role: 'INSTRUCTOR', department: byCode.get('IT')._id, employeeNumber: 'INS-IT-001' }),
    upsertUser({ firstName: 'Noah', lastName: 'Morgan', email: 'instructor.noah.it@mtu.edu.et', passwordHash, role: 'INSTRUCTOR', department: byCode.get('IT')._id, employeeNumber: 'INS-IT-002' }),
    upsertUser({ firstName: 'Alex', lastName: 'Student', email: 'student.alex@mtu.edu.et', passwordHash, role: 'STUDENT', department: byCode.get('CS')._id, studentNumber: 'STU-CS-001' }),
    upsertUser({ firstName: 'Marta', lastName: 'Solomon', email: 'student.marta.ee@mtu.edu.et', passwordHash, role: 'STUDENT', department: byCode.get('EE')._id, studentNumber: 'STU-EE-001' }),
    upsertUser({ firstName: 'Eyob', lastName: 'Tesema', email: 'student.eyob.ee@mtu.edu.et', passwordHash, role: 'STUDENT', department: byCode.get('EE')._id, studentNumber: 'STU-EE-002' }),
    upsertUser({ firstName: 'Hana', lastName: 'Lemma', email: 'student.hana.me@mtu.edu.et', passwordHash, role: 'STUDENT', department: byCode.get('ME')._id, studentNumber: 'STU-ME-001' }),
    upsertUser({ firstName: 'Biruk', lastName: 'Kassa', email: 'student.biruk.me@mtu.edu.et', passwordHash, role: 'STUDENT', department: byCode.get('ME')._id, studentNumber: 'STU-ME-002' }),
    upsertUser({ firstName: 'Selam', lastName: 'Yilma', email: 'student.selam.ce@mtu.edu.et', passwordHash, role: 'STUDENT', department: byCode.get('CE')._id, studentNumber: 'STU-CE-001' }),
    upsertUser({ firstName: 'Robel', lastName: 'Negash', email: 'student.robel.ce@mtu.edu.et', passwordHash, role: 'STUDENT', department: byCode.get('CE')._id, studentNumber: 'STU-CE-002' }),
    upsertUser({ firstName: 'Feven', lastName: 'Kifle', email: 'student.feven.it@mtu.edu.et', passwordHash, role: 'STUDENT', department: byCode.get('IT')._id, studentNumber: 'STU-IT-001' }),
    upsertUser({ firstName: 'Kaleb', lastName: 'Dagne', email: 'student.kaleb.it@mtu.edu.et', passwordHash, role: 'STUDENT', department: byCode.get('IT')._id, studentNumber: 'STU-IT-002' })
  ]);
  const userByEmail = new Map(users.map((user) => [user.email, user]));

  await Promise.all([
    Department.updateOne({ code: 'CS' }, { hod: userByEmail.get('hod.cs@mtu.edu.et')._id }),
    Department.updateOne({ code: 'EE' }, { hod: userByEmail.get('hod.ee@mtu.edu.et')._id }),
    Department.updateOne({ code: 'ME' }, { hod: userByEmail.get('hod.me@mtu.edu.et')._id }),
    Department.updateOne({ code: 'CE' }, { hod: userByEmail.get('hod.ce@mtu.edu.et')._id }),
    Department.updateOne({ code: 'IT' }, { hod: userByEmail.get('hod.it@mtu.edu.et')._id })
  ]);

  const courseSpecs = [
    { code: 'CS401', title: 'Software Engineering', creditHours: 3, department: 'CS', level: '400', instructor: 'instructor.ada@mtu.edu.et', students: ['student.alex@mtu.edu.et'] },
    { code: 'CS305', title: 'Database Systems', creditHours: 3, department: 'CS', level: '300', instructor: 'instructor.kojo@mtu.edu.et', students: ['student.alex@mtu.edu.et'] },
    { code: 'EE201', title: 'Circuit Analysis', creditHours: 4, department: 'EE', level: '200', instructor: 'instructor.meron.ee@mtu.edu.et', students: ['student.marta.ee@mtu.edu.et', 'student.eyob.ee@mtu.edu.et'] },
    { code: 'EE310', title: 'Power Systems', creditHours: 3, department: 'EE', level: '300', instructor: 'instructor.yonas.ee@mtu.edu.et', students: ['student.marta.ee@mtu.edu.et'] },
    { code: 'ME220', title: 'Thermodynamics', creditHours: 3, department: 'ME', level: '200', instructor: 'instructor.samuel.me@mtu.edu.et', students: ['student.hana.me@mtu.edu.et', 'student.biruk.me@mtu.edu.et'] },
    { code: 'ME410', title: 'Machine Design', creditHours: 3, department: 'ME', level: '400', instructor: 'instructor.ruth.me@mtu.edu.et', students: ['student.biruk.me@mtu.edu.et'] },
    { code: 'CE230', title: 'Structural Analysis', creditHours: 3, department: 'CE', level: '200', instructor: 'instructor.bekele.ce@mtu.edu.et', students: ['student.selam.ce@mtu.edu.et', 'student.robel.ce@mtu.edu.et'] },
    { code: 'CE320', title: 'Transportation Engineering', creditHours: 3, department: 'CE', level: '300', instructor: 'instructor.liya.ce@mtu.edu.et', students: ['student.selam.ce@mtu.edu.et'] },
    { code: 'IT210', title: 'Network Administration', creditHours: 3, department: 'IT', level: '200', instructor: 'instructor.tigist.it@mtu.edu.et', students: ['student.feven.it@mtu.edu.et', 'student.kaleb.it@mtu.edu.et'] },
    { code: 'IT330', title: 'Web Application Development', creditHours: 3, department: 'IT', level: '300', instructor: 'instructor.noah.it@mtu.edu.et', students: ['student.kaleb.it@mtu.edu.et'] }
  ];

  const assignments = [];
  for (const spec of courseSpecs) {
    const course = await upsertCourse({
      code: spec.code,
      title: spec.title,
      creditHours: spec.creditHours,
      department: byCode.get(spec.department)._id,
      semester: semester._id,
      level: spec.level
    });
    const instructor = userByEmail.get(spec.instructor) || await User.findOne({ email: spec.instructor });
    const students = await User.find({ email: { $in: spec.students } }).select('_id');
    const assignment = await upsertAssignment({
      instructor: instructor._id,
      course: course._id,
      semester: semester._id,
      enrolledStudents: students.map((student) => student._id),
      assignedBy: admin?._id || userByEmail.get('committee.cs@mtu.edu.et')?._id,
      status: 'PUBLISHED'
    });
    assignments.push(assignment);
  }

  await seedEceSampleData({ semester, passwordHash });
  return {
    departments: await Department.countDocuments(),
    users: await User.countDocuments(),
    courses: await Course.countDocuments({ semester: semester._id }),
    assignments: await InstructorAssignment.countDocuments({ semester: semester._id })
  };
}

export async function seedDemoData({ reset = false } = {}) {
  if (reset) {
    await Promise.all([
      Department.deleteMany({}), Semester.deleteMany({}), Course.deleteMany({}),
      User.deleteMany({}), InstructorAssignment.deleteMany({}),
      EvaluationTemplate.deleteMany({}), EvaluationKey.deleteMany({})
    ]);
  }

  await seedEvaluationTemplates();

  if (!reset && await User.exists({})) {
    return false;
  }

  const passwordHash = await User.hashPassword('Password123!');
  const department = await Department.create({ name: 'Computer Science', code: 'CS', faculty: 'Engineering and Technology' });
  const users = await User.create([
    { firstName: 'Mira', lastName: 'Admin', email: 'admin@mtu.edu.et', passwordHash, role: 'SUPER_ADMIN' },
    { firstName: 'Nadia', lastName: 'Head', email: 'hod.cs@mtu.edu.et', passwordHash, role: 'HOD', department: department._id, employeeNumber: 'HOD-001' },
    { firstName: 'Sam', lastName: 'Committee', email: 'committee.cs@mtu.edu.et', passwordHash, role: 'EXAM_COMMITTEE', department: department._id, employeeNumber: 'COM-001' },
    { firstName: 'Ada', lastName: 'Mensah', email: 'instructor.ada@mtu.edu.et', passwordHash, role: 'INSTRUCTOR', department: department._id, employeeNumber: 'INS-001' },
    { firstName: 'Kojo', lastName: 'Annan', email: 'instructor.kojo@mtu.edu.et', passwordHash, role: 'INSTRUCTOR', committeeRoles: ['COURSE_COMMITTEE'], department: department._id, employeeNumber: 'INS-002' },
    { firstName: 'Alex', lastName: 'Student', email: 'student.alex@mtu.edu.et', passwordHash, role: 'STUDENT', department: department._id, studentNumber: 'STU-001' }
  ]);
  department.hod = users[1]._id;
  await department.save();
  const semester = await Semester.create({ name: 'Fall Semester', academicYear: '2026/2027', startsAt: new Date('2026-09-01'), endsAt: new Date('2026-12-20'), evaluationOpensAt: new Date('2026-07-01'), evaluationClosesAt: new Date('2026-12-15'), status: 'OPEN' });
  const softwareEngineering = await Course.create({ code: 'CS401', title: 'Software Engineering', creditHours: 3, department: department._id, semester: semester._id, level: '400' });
  const databaseSystems = await Course.create({ code: 'CS305', title: 'Database Systems', creditHours: 3, department: department._id, semester: semester._id, level: '300' });
  const assignment = await InstructorAssignment.create({ instructor: users[3]._id, course: softwareEngineering._id, semester: semester._id, enrolledStudents: [users[5]._id], assignedBy: users[2]._id, status: 'PUBLISHED' });
  await InstructorAssignment.create({ instructor: users[4]._id, course: databaseSystems._id, semester: semester._id, enrolledStudents: [users[5]._id], assignedBy: users[2]._id, status: 'PUBLISHED' });
  await EvaluationKey.create({ keyHash: await bcrypt.hash('EVAL-CS401-2026', 12), student: users[5]._id, assignment: assignment._id, expiresAt: new Date('2027-01-31'), generatedBy: users[2]._id });
  await seedSampleAcademicData();
  return true;
}
