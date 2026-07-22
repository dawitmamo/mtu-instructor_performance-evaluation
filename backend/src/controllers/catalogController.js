import { Department } from '../models/Department.js';
import { Course } from '../models/Course.js';
import { Semester } from '../models/Semester.js';
import { InstructorAssignment } from '../models/InstructorAssignment.js';
import { ExamCommittee } from '../models/ExamCommittee.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { User } from '../models/User.js';
import { validateCourseAcademicProfile, validateUserAcademicProfile } from '../utils/academicProfile.js';

const assignmentPopulate = (query) => query
  .populate('instructor', 'firstName lastName email')
  .populate('course')
  .populate('semester', 'name academicYear')
  .populate('enrolledStudents', 'firstName lastName email studentNumber yearLevel academicStream')
  .populate('peerEvaluators', 'firstName lastName email employeeNumber');

function notFound(res, name) {
  return res.status(404).json({ message: `${name} not found` });
}

function sameId(first, second) {
  return String(first?._id || first) === String(second?._id || second);
}

function isCommitteeOperator(user) {
  return user.role === 'EXAM_COMMITTEE' || (user.committeeRoles || []).some((role) => ['COURSE_COMMITTEE', 'EXAM_COMMITTEE'].includes(role));
}

function httpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function ensureDepartmentAccess(req, department) {
  if (req.user.role !== 'SUPER_ADMIN' && (!req.user.department || !sameId(req.user.department, department))) {
    throw httpError('You can only manage records in your department', 403);
  }
}

async function validateAssignmentRelations(req, body) {
  const course = await Course.findById(body.course);
  if (!course) throw httpError('Course not found', 404);
  ensureDepartmentAccess(req, course.department);
  if (!sameId(course.semester, body.semester)) throw httpError('Assignment semester must match the course semester', 400);

  const requestedIds = [...new Set([body.instructor, ...body.enrolledStudents, ...body.peerEvaluators])];
  const users = await User.find({ _id: { $in: requestedIds } }).select('role department isActive yearLevel academicStream');
  const usersById = new Map(users.map((user) => [user.id, user]));
  const instructor = usersById.get(body.instructor);
  if (!instructor || instructor.role !== 'INSTRUCTOR' || !instructor.isActive) {
    throw httpError('Assignment instructor must be an active instructor account', 400);
  }
  if (!sameId(instructor.department, course.department)) {
    throw httpError('Assignment instructor must belong to the course department', 400);
  }
  if (course.academicStream && instructor.academicStream !== course.academicStream) {
    throw httpError('Assignment instructor must belong to the course academic stream', 400);
  }
  if (body.enrolledStudents.some((id) => usersById.get(id)?.role !== 'STUDENT' || !usersById.get(id)?.isActive)) {
    throw httpError('Every enrolled evaluator must be an active student account', 400);
  }
  if (body.enrolledStudents.some((id) => !sameId(usersById.get(id)?.department, course.department))) {
    throw httpError('Every enrolled student must belong to the course department', 400);
  }
  if (course.yearLevel && body.enrolledStudents.some((id) => usersById.get(id)?.yearLevel !== course.yearLevel)) {
    throw httpError(`Every enrolled student must belong to Year ${course.yearLevel}`, 400);
  }
  if (course.academicStream && body.enrolledStudents.some((id) => usersById.get(id)?.academicStream !== course.academicStream)) {
    throw httpError('Every enrolled student must belong to the course academic stream', 400);
  }
  if (body.peerEvaluators.some((id) => sameId(id, body.instructor) || usersById.get(id)?.role !== 'INSTRUCTOR' || !usersById.get(id)?.isActive)) {
    throw httpError('Every peer evaluator must be another active instructor', 400);
  }
  if (body.peerEvaluators.some((id) => !sameId(usersById.get(id)?.department, course.department))) {
    throw httpError('Every peer evaluator must belong to the course department', 400);
  }
}

function sanitizeUserPayload(body) {
  const { password, ...payload } = body;
  if (!payload.department) delete payload.department;
  if (!payload.studentNumber) delete payload.studentNumber;
  if (!payload.yearLevel) delete payload.yearLevel;
  if (payload.gpa === undefined) delete payload.gpa;
  if (!payload.academicStream) delete payload.academicStream;
  if (!payload.employeeNumber) delete payload.employeeNumber;
  return { payload, password };
}

export const listDepartments = asyncHandler(async (req, res) => res.json({ departments: await Department.find().populate('hod', 'firstName lastName email') }));
export const listUsers = asyncHandler(async (req, res) => {
  const filter = req.query.role ? { role: req.query.role } : {};
  if (req.user.role !== 'SUPER_ADMIN') {
    if (req.user.department) filter.department = req.user.department;
    else filter._id = null;
  }
  const users = await User.find(filter).select('firstName lastName email role committeeRoles department studentNumber yearLevel gpa academicStream employeeNumber isActive').populate('department', 'name code').sort({ yearLevel: 1, academicStream: 1, lastName: 1 });
  res.json({ users });
});
export const createDepartment = asyncHandler(async (req, res) => res.status(201).json({ department: await Department.create(req.validated.body) }));
export const updateDepartment = asyncHandler(async (req, res) => {
  const department = await Department.findByIdAndUpdate(req.params.id, req.validated.body, { new: true, runValidators: true }).populate('hod', 'firstName lastName email');
  if (!department) return notFound(res, 'Department');
  res.json({ department });
});
export const listSemesters = asyncHandler(async (req, res) => res.json({ semesters: await Semester.find().sort({ startsAt: -1 }) }));
export const createSemester = asyncHandler(async (req, res) => res.status(201).json({ semester: await Semester.create(req.validated.body) }));
export const updateSemester = asyncHandler(async (req, res) => {
  const semester = await Semester.findByIdAndUpdate(req.params.id, req.validated.body, { new: true, runValidators: true });
  if (!semester) return notFound(res, 'Semester');
  res.json({ semester });
});

export const listCourses = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.user.role === 'HOD' || isCommitteeOperator(req.user)) {
    if (!req.user.department) filter._id = null;
    else filter.department = req.user.department;
  } else if (req.query.department) filter.department = req.query.department;
  if (req.query.semester) filter.semester = req.query.semester;
  const courses = await Course.find(filter).populate('department', 'name code').populate('semester', 'name academicYear');
  res.json({ courses });
});

export const createCourse = asyncHandler(async (req, res) => {
  await validateCourseAcademicProfile(req.validated.body);
  ensureDepartmentAccess(req, req.validated.body.department);
  res.status(201).json({ course: await Course.create(req.validated.body) });
});
export const updateCourse = asyncHandler(async (req, res) => {
  const current = await Course.findById(req.params.id);
  if (!current) return notFound(res, 'Course');
  ensureDepartmentAccess(req, current.department);
  ensureDepartmentAccess(req, req.validated.body.department);
  await validateCourseAcademicProfile(req.validated.body);
  const course = await Course.findByIdAndUpdate(req.params.id, req.validated.body, { new: true, runValidators: true }).populate('department', 'name code').populate('semester', 'name academicYear');
  res.json({ course });
});

export const listAssignments = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.user.role === 'HOD' || isCommitteeOperator(req.user)) {
    const courses = req.user.department ? await Course.find({ department: req.user.department }).select('_id') : [];
    filter.course = { $in: courses.map((course) => course._id) };
  } else if (req.user.role === 'INSTRUCTOR') {
    filter.instructor = req.user.id;
  } else if (req.user.role === 'STUDENT') {
    filter.enrolledStudents = req.user.id;
  }
  if (req.query.instructor) filter.instructor = req.query.instructor;
  if (req.query.semester) filter.semester = req.query.semester;
  const assignments = await assignmentPopulate(InstructorAssignment.find(filter)).sort({ updatedAt: -1 });
  res.json({ assignments });
});

export const createAssignment = asyncHandler(async (req, res) => {
  await validateAssignmentRelations(req, req.validated.body);
  const { instructor, course, semester } = req.validated.body;
  const assignment = await InstructorAssignment.findOneAndUpdate(
    { instructor, course, semester },
    { ...req.validated.body, assignedBy: req.user.id },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );
  res.status(201).json({ assignment: await assignmentPopulate(InstructorAssignment.findById(assignment._id)) });
});
export const updateAssignment = asyncHandler(async (req, res) => {
  const current = await InstructorAssignment.findById(req.params.id).populate('course');
  if (!current) return notFound(res, 'Assignment');
  ensureDepartmentAccess(req, current.course.department);
  await validateAssignmentRelations(req, req.validated.body);
  const assignment = await InstructorAssignment.findByIdAndUpdate(req.params.id, req.validated.body, { new: true, runValidators: true });
  res.json({ assignment: await assignmentPopulate(InstructorAssignment.findById(assignment._id)) });
});

export const updateUser = asyncHandler(async (req, res) => {
  const current = await User.findById(req.params.id);
  if (!current) return notFound(res, 'User');
  const { payload, password } = sanitizeUserPayload(req.validated.body);
  await validateUserAcademicProfile(payload);
  if (payload.committeeRoles?.length && payload.role !== 'INSTRUCTOR') {
    return res.status(400).json({ message: 'Committee duties can only be assigned to instructor accounts' });
  }
  const currentIsExamMember = (current.committeeRoles || []).includes('EXAM_COMMITTEE');
  const requestedAsExamMember = (payload.committeeRoles || []).includes('EXAM_COMMITTEE');
  if (currentIsExamMember !== requestedAsExamMember) {
    return res.status(400).json({ message: 'Assign Exam Committee members from the semester Exam Committee page' });
  }
  if (req.user.role === 'HOD' && (current.role === 'SUPER_ADMIN' || payload.role === 'SUPER_ADMIN')) return res.status(403).json({ message: 'HOD users cannot modify Super Admin accounts' });
  if (req.user.role === 'HOD') {
    if (!req.user.department || !sameId(current.department, req.user.department) || !sameId(payload.department, req.user.department)) {
      return res.status(403).json({ message: 'HOD users can only modify accounts in their department' });
    }
  }
  if (isCommitteeOperator(req.user) && req.user.role !== 'HOD') {
    if (!['INSTRUCTOR', 'STUDENT'].includes(current.role) || !['INSTRUCTOR', 'STUDENT'].includes(payload.role)) {
      return res.status(403).json({ message: 'Committee members can only modify instructor or student accounts' });
    }
    if (!req.user.department || !sameId(current.department, req.user.department) || !sameId(payload.department, req.user.department)) {
      return res.status(403).json({ message: 'Committee members can only modify accounts in their department' });
    }
    payload.committeeRoles = current.committeeRoles || [];
  }
  if (payload.role === 'SUPER_ADMIN') delete payload.department;
  if (payload.role === 'STUDENT') delete payload.employeeNumber;
  if (password) payload.passwordHash = await User.hashPassword(password);
  const unset = {};
  if (payload.role === 'SUPER_ADMIN') unset.department = 1;
  if (payload.role !== 'STUDENT') {
    unset.studentNumber = 1;
    unset.yearLevel = 1;
    unset.gpa = 1;
  } else {
    if (!payload.yearLevel) unset.yearLevel = 1;
    if (payload.gpa === undefined) unset.gpa = 1;
    unset.employeeNumber = 1;
  }
  if (!payload.academicStream) unset.academicStream = 1;
  if (!payload.employeeNumber) unset.employeeNumber = 1;
  const update = { $set: payload };
  if (Object.keys(unset).length) update.$unset = unset;
  const user = await User.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true }).select('firstName lastName email role committeeRoles department studentNumber yearLevel gpa academicStream employeeNumber isActive').populate('department', 'name code');
  res.json({ user });
});

export const upsertExamCommittee = asyncHandler(async (req, res) => {
  if (!req.user.department) return res.status(403).json({ message: 'The HOD account must belong to a department' });
  const { semester, members, chair } = req.validated.body;
  if (!(await Semester.exists({ _id: semester }))) return notFound(res, 'Semester');

  const instructors = await User.find({ _id: { $in: members }, role: 'INSTRUCTOR', department: req.user.department, isActive: true });
  if (instructors.length !== 3) {
    return res.status(400).json({ message: 'Select exactly three active instructors from your department' });
  }

  const previous = await ExamCommittee.findOne({ department: req.user.department, semester });
  const committee = await ExamCommittee.findOneAndUpdate(
    { department: req.user.department, semester },
    { department: req.user.department, semester, members, chair, appointedBy: req.user.id, status: 'ACTIVE' },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );

  await User.updateMany({ _id: { $in: members } }, { $addToSet: { committeeRoles: 'EXAM_COMMITTEE' } });
  const removedMembers = (previous?.members || []).filter((member) => !members.includes(String(member)));
  for (const member of removedMembers) {
    const stillAppointed = await ExamCommittee.exists({ _id: { $ne: committee._id }, status: 'ACTIVE', members: member });
    if (!stillAppointed) await User.updateOne({ _id: member }, { $pull: { committeeRoles: 'EXAM_COMMITTEE' } });
  }

  const populated = await ExamCommittee.findById(committee._id)
    .populate('department', 'name code')
    .populate('semester', 'name academicYear status')
    .populate('members', 'firstName lastName email employeeNumber academicStream')
    .populate('chair', 'firstName lastName email employeeNumber academicStream')
    .populate('appointedBy', 'firstName lastName email');
  res.status(previous ? 200 : 201).json({ committee: populated });
});

export const listExamCommittees = asyncHandler(async (req, res) => {
  const committees = await ExamCommittee.find({ department: req.user.department })
    .populate('department', 'name code')
    .populate('semester', 'name academicYear status')
    .populate('members', 'firstName lastName email employeeNumber academicStream')
    .populate('chair', 'firstName lastName email employeeNumber academicStream')
    .populate('appointedBy', 'firstName lastName email')
    .sort({ updatedAt: -1 });
  res.json({ committees });
});
