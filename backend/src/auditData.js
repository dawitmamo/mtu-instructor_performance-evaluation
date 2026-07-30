import { connectDb, disconnectDb } from './config/db.js';
import { Course } from './models/Course.js';
import { Department } from './models/Department.js';
import { ExamCommittee } from './models/ExamCommittee.js';
import { InstructorAssignment } from './models/InstructorAssignment.js';
import './models/Semester.js';
import { StreamSelectionRound } from './models/StreamSelectionRound.js';
import { User } from './models/User.js';
import { isMtuEmail } from './utils/email.js';
import { Schedule } from './models/Schedule.js';

await connectDb();
try {
  const department = await Department.findOne({ code: 'ECE' });
  if (!department) throw new Error('ECE department is missing');
  const [users, courses, committees, rounds, allUsers, schedules] = await Promise.all([
    User.find({ department: department._id }),
    Course.find({ department: department._id }),
    ExamCommittee.find({ department: department._id }),
    StreamSelectionRound.find({ department: department._id }).populate('semester', 'name academicYear'),
    User.find({}).select('email role committeeRoles'),
    Schedule.find({ department: department._id }).select('semester status')
  ]);
  const courseMap = new Map(courses.map((course) => [course.id, course]));
  const assignments = await InstructorAssignment.find({ course: { $in: courses.map((course) => course._id) } }).populate('instructor').populate('enrolledStudents');
  const invalidAssignments = assignments.filter((assignment) => {
    const course = courseMap.get(String(assignment.course));
    return !course
      || String(assignment.instructor?.department) !== String(department._id)
      || (course.academicStream && assignment.instructor?.academicStream !== course.academicStream)
      || assignment.enrolledStudents.some((student) => String(student.department) !== String(department._id)
        || (course.yearLevel && student.yearLevel !== course.yearLevel)
        || (course.academicStream && student.academicStream !== course.academicStream));
  });
  const invalidEceStudents = users.filter((user) => user.role === 'STUDENT'
    && (!user.yearLevel || (user.yearLevel >= 4 && !user.academicStream) || (user.yearLevel < 4 && user.academicStream)));
  const invalidEceInstructors = users.filter((user) => user.role === 'INSTRUCTOR' && !user.academicStream);
  const allUserMap = new Map(allUsers.map((user) => [user.id, user]));
  const invalidCommitteeUsers = allUsers.filter((user) => {
    const duties = user.committeeRoles || [];
    return !['SUPER_ADMIN', 'HOD', 'INSTRUCTOR', 'STUDENT'].includes(user.role)
      || duties.some((duty) => duty !== 'COURSE_EXAM_COMMITTEE')
      || (duties.includes('COURSE_EXAM_COMMITTEE') && user.role !== 'INSTRUCTOR');
  });
  const invalidCommittees = committees.filter((committee) => committee.members.length !== 3
    || new Set(committee.members.map(String)).size !== 3
    || committee.members.some((member) => {
      const user = allUserMap.get(String(member));
      return user?.role !== 'INSTRUCTOR' || !(user.committeeRoles || []).includes('COURSE_EXAM_COMMITTEE');
    }));
  const summary = {
    eceUsers: users.length,
    invalidMtuEmails: allUsers.filter((user) => !isMtuEmail(user.email)).length,
    yearCohorts: Object.fromEntries([2, 3, 4, 5].map((year) => [year, users.filter((user) => user.role === 'STUDENT' && user.yearLevel === year).length])),
    invalidEceStudents: invalidEceStudents.length,
    invalidEceInstructors: invalidEceInstructors.length,
    courses: courses.length,
    schedules: schedules.length,
    assignments: assignments.length,
    invalidAssignments: invalidAssignments.length,
    invalidCommitteeUsers: invalidCommitteeUsers.length,
    invalidCommittees: invalidCommittees.length,
    selectionRounds: rounds.map((round) => ({
      semester: `${round.semester?.name || 'Unknown'} ${round.semester?.academicYear || ''}`.trim(),
      status: round.status,
      capacity: round.capacities.reduce((total, item) => total + item.seats, 0)
    }))
  };
  console.log(`ECE data integrity: ${JSON.stringify(summary)}`);
  if (summary.invalidMtuEmails || invalidEceStudents.length || invalidEceInstructors.length || invalidAssignments.length || invalidCommitteeUsers.length || invalidCommittees.length) process.exitCode = 1;
} finally {
  await disconnectDb();
}
