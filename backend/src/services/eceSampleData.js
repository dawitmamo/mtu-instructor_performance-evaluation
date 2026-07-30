import { Course } from '../models/Course.js';
import { Department } from '../models/Department.js';
import { ExamCommittee } from '../models/ExamCommittee.js';
import { InstructorAssignment } from '../models/InstructorAssignment.js';
import { Semester } from '../models/Semester.js';
import { User } from '../models/User.js';
import { ACADEMIC_STREAMS } from '../constants/academicStreams.js';
import { StreamSelectionRound } from '../models/StreamSelectionRound.js';
import { Schedule } from '../models/Schedule.js';

const instructorSpecs = [
  { firstName: 'Mimi', lastName: 'Kebede', email: 'instructor.mimi.ece@mtu.edu.et', employeeNumber: 'INS-ECE-001', academicStream: ACADEMIC_STREAMS[0] },
  { firstName: 'Nahom', lastName: 'Alemu', email: 'instructor.nahom.ece@mtu.edu.et', employeeNumber: 'INS-ECE-002', academicStream: ACADEMIC_STREAMS[1] },
  { firstName: 'Rahel', lastName: 'Tesfaye', email: 'instructor.rahel.ece@mtu.edu.et', employeeNumber: 'INS-ECE-003', academicStream: ACADEMIC_STREAMS[2] },
  { firstName: 'Samuel', lastName: 'Girma', email: 'instructor.samuel.ece@mtu.edu.et', employeeNumber: 'INS-ECE-004', academicStream: ACADEMIC_STREAMS[3] }
];

const firstNames = ['Abel', 'Betelhem', 'Dagmawi', 'Eden', 'Fitsum', 'Gelila', 'Henok', 'Kidus', 'Liya', 'Mikiyas'];
const lastNames = ['Alemu', 'Bekele', 'Chala', 'Desta', 'Fikru', 'Girma', 'Hailu', 'Kebede', 'Lemma', 'Mamo'];
const yearThreeGpas = [3.92, 3.78, 3.65, 3.51, 3.4, 3.28, 3.12, 2.96, 2.8, 2.65];

const courseSpecs = [
  { code: 'ECE201', title: 'Circuit Theory II', yearLevel: 2, creditHours: 4, instructorIndex: 0 },
  { code: 'ECE202', title: 'Digital Logic Design', yearLevel: 2, creditHours: 3, instructorIndex: 1 },
  { code: 'ECE301', title: 'Signals and Systems', yearLevel: 3, creditHours: 4, instructorIndex: 2 },
  { code: 'ECE302', title: 'Microprocessors and Interfacing', yearLevel: 3, creditHours: 3, instructorIndex: 3 },
  { code: 'ECE401', title: 'Communication Systems', yearLevel: 4, creditHours: 4, instructorIndex: 0, academicStream: ACADEMIC_STREAMS[0] },
  { code: 'ECE403', title: 'Computer Architecture', yearLevel: 4, creditHours: 3, instructorIndex: 1, academicStream: ACADEMIC_STREAMS[1] },
  { code: 'ECE404', title: 'Electrical Machines II', yearLevel: 4, creditHours: 4, instructorIndex: 2, academicStream: ACADEMIC_STREAMS[2] },
  { code: 'ECE402', title: 'Industrial Control Systems', yearLevel: 4, creditHours: 3, instructorIndex: 3, academicStream: ACADEMIC_STREAMS[3] },
  { code: 'ECE503', title: 'Wireless Communication Engineering', yearLevel: 5, creditHours: 4, instructorIndex: 0, academicStream: ACADEMIC_STREAMS[0] },
  { code: 'ECE501', title: 'Advanced Embedded Systems', yearLevel: 5, creditHours: 4, instructorIndex: 1, academicStream: ACADEMIC_STREAMS[1] },
  { code: 'ECE502', title: 'Power System Protection', yearLevel: 5, creditHours: 3, instructorIndex: 2, academicStream: ACADEMIC_STREAMS[2] },
  { code: 'ECE504', title: 'Process Automation', yearLevel: 5, creditHours: 3, instructorIndex: 3, academicStream: ACADEMIC_STREAMS[3] }
];

async function ensureSemester(providedSemester) {
  if (providedSemester) return providedSemester;
  return Semester.findOneAndUpdate(
    { name: 'Fall Semester', academicYear: '2026/2027' },
    { name: 'Fall Semester', academicYear: '2026/2027', startsAt: new Date('2026-09-01'), endsAt: new Date('2026-12-20'), evaluationOpensAt: new Date('2026-07-01'), evaluationClosesAt: new Date('2026-12-15'), status: 'OPEN' },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );
}

async function ensureSelectionSemester() {
  return Semester.findOneAndUpdate(
    { name: 'Second Semester', academicYear: '2026/2027' },
    { name: 'Second Semester', academicYear: '2026/2027', startsAt: new Date('2027-01-05'), endsAt: new Date('2027-06-20'), status: 'OPEN' },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );
}

async function upsertSampleUser(email, payload) {
  return User.findOneAndUpdate(
    { email },
    { ...payload, username: email.split('@')[0], email, isActive: true },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );
}

export async function seedEceSampleData(options = {}) {
  const passwordHash = options.passwordHash || await User.hashPassword('Password123!');
  const semester = await ensureSemester(options.semester);
  const selectionSemester = await ensureSelectionSemester();
  const department = await Department.findOneAndUpdate(
    { code: 'ECE' },
    { code: 'ECE', name: 'Electrical and Computer Engineering', faculty: 'Engineering and Technology' },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );

  let hod = await User.findOne({ role: 'HOD', department: department._id, isActive: true }).sort({ createdAt: 1 });
  if (!hod) {
    hod = await upsertSampleUser('hod.ece@mtu.edu.et', { firstName: 'Dawit', lastName: 'Mamo', passwordHash, role: 'HOD', department: department._id, employeeNumber: 'HOD-ECE-001' });
  }
  await Department.updateOne({ _id: department._id }, { hod: hod._id });

  const instructors = await Promise.all(instructorSpecs.map((spec) => upsertSampleUser(spec.email, {
    firstName: spec.firstName, lastName: spec.lastName, passwordHash, role: 'INSTRUCTOR', department: department._id, employeeNumber: spec.employeeNumber, academicStream: spec.academicStream
  })));
  const allInstructors = await User.find({ role: 'INSTRUCTOR', department: department._id, isActive: true }).sort({ createdAt: 1 });
  for (const [index, instructor] of allInstructors.entries()) {
    if (!instructor.academicStream) await User.updateOne({ _id: instructor._id }, { academicStream: ACADEMIC_STREAMS[index % ACADEMIC_STREAMS.length] });
  }

  const studentsByYear = new Map();
  for (const yearLevel of [2, 3, 4, 5]) {
    const cohort = await Promise.all(firstNames.map((firstName, index) => {
      const number = String(index + 1).padStart(2, '0');
      return upsertSampleUser(`student.ece.y${yearLevel}.${number}@mtu.edu.et`, {
        firstName, lastName: lastNames[(index + yearLevel) % lastNames.length], passwordHash, role: 'STUDENT',
        department: department._id, studentNumber: `ECE-Y${yearLevel}-2026-${number}`, yearLevel,
        gpa: yearLevel === 3 ? yearThreeGpas[index] : undefined,
        academicStream: yearLevel >= 4 ? ACADEMIC_STREAMS[index % ACADEMIC_STREAMS.length] : undefined
      });
    }));
    studentsByYear.set(yearLevel, cohort);
  }

  const assignments = [];
  for (const spec of courseSpecs) {
    const course = await Course.findOneAndUpdate(
      { code: spec.code, semester: semester._id },
      { code: spec.code, title: spec.title, creditHours: spec.creditHours, department: department._id, semester: semester._id, level: `Year ${spec.yearLevel}`, yearLevel: spec.yearLevel, academicStream: spec.academicStream },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );
    const instructor = instructors[spec.instructorIndex];
    const peer = instructors[(spec.instructorIndex + 1) % instructors.length];
    const assignment = await InstructorAssignment.findOneAndUpdate(
      { course: course._id, semester: semester._id },
      { instructor: instructor._id, course: course._id, semester: semester._id, enrolledStudents: studentsByYear.get(spec.yearLevel).filter((student) => !spec.academicStream || student.academicStream === spec.academicStream).map((student) => student._id), peerEvaluators: [peer._id], assignedBy: hod._id, status: 'PUBLISHED' },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );
    assignments.push(assignment);
  }

  const committeeMembers = instructors.slice(0, 3).map((instructor) => instructor._id);
  const previousCommittee = await ExamCommittee.findOne({ department: department._id, semester: semester._id });
  const committee = await ExamCommittee.findOneAndUpdate(
    { department: department._id, semester: semester._id },
    { department: department._id, semester: semester._id, members: committeeMembers, chair: committeeMembers[0], appointedBy: hod._id, status: 'ACTIVE' },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );
  await User.updateMany({ _id: { $in: committeeMembers } }, { $addToSet: { committeeRoles: 'COURSE_EXAM_COMMITTEE' } });
  const removedMembers = (previousCommittee?.members || []).filter((member) => !committeeMembers.some((selected) => String(selected) === String(member)));
  for (const member of removedMembers) {
    const stillAppointed = await ExamCommittee.exists({ _id: { $ne: committee._id }, status: 'ACTIVE', members: member });
    if (!stillAppointed) await User.updateOne({ _id: member }, { $pull: { committeeRoles: 'COURSE_EXAM_COMMITTEE' } });
  }

  await ExamCommittee.findOneAndUpdate(
    { department: department._id, semester: selectionSemester._id },
    { department: department._id, semester: selectionSemester._id, members: committeeMembers, chair: committeeMembers[0], appointedBy: hod._id, status: 'ACTIVE' },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );

  const selectionRound = await StreamSelectionRound.findOneAndUpdate(
    { department: department._id, semester: selectionSemester._id },
    { $setOnInsert: {
        department: department._id,
        semester: selectionSemester._id,
        eligibleYearLevel: 3,
        status: 'OPEN',
        capacities: [
          { academicStream: ACADEMIC_STREAMS[0], seats: 3 },
          { academicStream: ACADEMIC_STREAMS[1], seats: 3 },
          { academicStream: ACADEMIC_STREAMS[2], seats: 2 },
          { academicStream: ACADEMIC_STREAMS[3], seats: 2 }
        ],
        createdBy: hod._id
      }
    },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );

  await Schedule.findOneAndUpdate(
    { department: department._id, semester: selectionSemester._id, title: 'ECE Second Semester Class and Exam Schedule' },
    {
      title: 'ECE Second Semester Class and Exam Schedule',
      description: 'Classes run Monday-Friday from 08:00-17:00. Final examination dates, rooms, and invigilator assignments are published by the department before the examination period.',
      scheduleType: 'COMBINED', department: department._id, semester: selectionSemester._id,
      status: 'PUBLISHED', uploadedBy: hod._id, publishedAt: new Date()
    },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );

  return {
    department: department.code,
    semester: `${semester.name} ${semester.academicYear}`,
    streamSelectionSemester: `${selectionSemester.name} ${selectionSemester.academicYear}`,
    studentsByYear: Object.fromEntries([...studentsByYear].map(([year, students]) => [year, students.length])),
    totalStudents: [...studentsByYear.values()].reduce((total, students) => total + students.length, 0),
    sampleInstructors: instructors.length,
    courses: courseSpecs.length,
    assignments: assignments.length,
    schedules: 1,
    courseExamCommitteeMembers: committeeMembers.length,
    streamSelectionRound: selectionRound.status,
    streamCapacity: selectionRound.capacities.reduce((total, item) => total + item.seats, 0)
  };
}
