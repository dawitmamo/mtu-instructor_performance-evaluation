import { Department } from '../models/Department.js';
import { Course } from '../models/Course.js';
import { Semester } from '../models/Semester.js';
import { InstructorAssignment } from '../models/InstructorAssignment.js';
import { CoursePreference } from '../models/CoursePreference.js';
import { ExamCommittee } from '../models/ExamCommittee.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { User } from '../models/User.js';
import { validateCourseAcademicProfile, validateUserAcademicProfile } from '../utils/academicProfile.js';
import { syncEvaluationNotifications } from '../services/evaluationNotifications.js';

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
  return (user.committeeRoles || []).includes('COURSE_EXAM_COMMITTEE');
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

async function validateAssignmentRelations(req, body, currentAssignmentId) {
  const course = await Course.findById(body.course);
  if (!course) throw httpError('Course not found', 404);
  ensureDepartmentAccess(req, course.department);
  if (!sameId(course.semester, body.semester)) throw httpError('Assignment semester must match the course semester', 400);
  if (body.enrollmentMode === 'COHORT') {
    const cohort = body.studentCohort;
    if (course.yearLevel && cohort.yearLevel !== course.yearLevel) {
      throw httpError(`The selected class must be Year ${course.yearLevel} for this course`, 400);
    }
    if (course.academicStream && cohort.academicStream !== course.academicStream) {
      throw httpError('The selected class must match the course academic stream', 400);
    }
    const cohortStudents = await User.find({
      role: 'STUDENT',
      isActive: true,
      department: course.department,
      yearLevel: cohort.yearLevel,
      ...(cohort.academicStream ? { academicStream: cohort.academicStream } : {})
    }).select('_id');
    if (!cohortStudents.length) throw httpError('No active students were found in the selected class', 400);
    body.enrolledStudents = cohortStudents.map((student) => student.id);
  } else {
    delete body.studentCohort;
  }
  const assignmentConflict = await InstructorAssignment.findOne({
    ...(currentAssignmentId ? { _id: { $ne: currentAssignmentId } } : {}),
    course: body.course,
    semester: body.semester,
    instructor: { $ne: body.instructor }
  });
  if (assignmentConflict) throw httpError('This course is already held by another instructor', 409);
  const preferenceConflict = await CoursePreference.findOne({
    confirmedCourse: body.course,
    semester: body.semester,
    instructor: { $ne: body.instructor },
    status: { $in: ['FINALIZED', 'CONFIRMED'] }
  });
  if (preferenceConflict) throw httpError('This course allocation was finalized for another instructor', 409);

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
  if (req.user.role === 'HOD' || isCommitteeOperator(req.user)) {
    if (req.query.role && !['INSTRUCTOR', 'STUDENT'].includes(req.query.role)) filter._id = null;
    filter.role = req.query.role || { $in: ['INSTRUCTOR', 'STUDENT'] };
    if (req.user.department) filter.department = req.user.department;
    else filter._id = null;
  }
  const users = await User.find(filter).select('firstName lastName username email role committeeRoles department studentNumber yearLevel gpa academicStream employeeNumber isActive registrationStatus reviewedBy reviewedAt createdAt').populate('department', 'name code').populate('reviewedBy', 'firstName lastName').sort({ createdAt: -1, lastName: 1 });
  const statusOrder = { PENDING: 0, REJECTED: 1, APPROVED: 2 };
  users.sort((first, second) => (statusOrder[first.registrationStatus || 'APPROVED'] ?? 2) - (statusOrder[second.registrationStatus || 'APPROVED'] ?? 2));
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
  if (req.user.role === 'HOD' || req.user.role === 'STUDENT' || isCommitteeOperator(req.user)) {
    if (!req.user.department) filter._id = null;
    else filter.department = req.user.department;
  } else if (req.query.department) filter.department = req.query.department;
  if (req.query.semester) filter.semester = req.query.semester;
  const courses = await Course.find(filter)
    .populate('department', 'name code')
    .populate('semester', 'name academicYear')
    .sort({ department: 1, yearLevel: 1, level: 1, code: 1 });
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
  const canManageDepartmentAssignments = req.user.role === 'HOD' || isCommitteeOperator(req.user);
  if (canManageDepartmentAssignments) {
    const courses = req.user.department ? await Course.find({ department: req.user.department }).select('_id') : [];
    filter.course = { $in: courses.map((course) => course._id) };
  } else if (req.user.role === 'INSTRUCTOR') {
    filter.instructor = req.user.id;
  } else if (req.user.role === 'STUDENT') {
    filter.enrolledStudents = req.user.id;
  }
  // Only assignment managers may choose an arbitrary instructor. Without this
  // guard an instructor could replace the own-account filter through the query
  // string and retrieve another instructor's student roster.
  if (req.query.instructor && (req.user.role === 'SUPER_ADMIN' || canManageDepartmentAssignments)) {
    filter.instructor = req.query.instructor;
  }
  if (req.query.semester) filter.semester = req.query.semester;
  const assignments = await assignmentPopulate(InstructorAssignment.find(filter)).sort({ updatedAt: -1 });
  res.json({ assignments });
});

export const createAssignment = asyncHandler(async (req, res) => {
  await validateAssignmentRelations(req, req.validated.body);
  const { instructor, course, semester } = req.validated.body;
  const existing = await InstructorAssignment.exists({ instructor, course, semester });
  if (existing) throw httpError('This course assignment already exists; edit it instead of creating another one', 409);
  const assignment = await InstructorAssignment.create({ ...req.validated.body, assignedBy: req.user.id });
  await syncEvaluationNotifications(assignment._id, req.user.id);
  res.status(201).json({ assignment: await assignmentPopulate(InstructorAssignment.findById(assignment._id)) });
});
export const updateAssignment = asyncHandler(async (req, res) => {
  const current = await InstructorAssignment.findById(req.params.id).populate('course');
  if (!current) return notFound(res, 'Assignment');
  ensureDepartmentAccess(req, current.course.department);
  await validateAssignmentRelations(req, req.validated.body, current._id);
  const assignment = await InstructorAssignment.findByIdAndUpdate(req.params.id, req.validated.body, { new: true, runValidators: true });
  await syncEvaluationNotifications(assignment._id, req.user.id);
  res.json({ assignment: await assignmentPopulate(InstructorAssignment.findById(assignment._id)) });
});

export const updateUser = asyncHandler(async (req, res) => {
  const current = await User.findById(req.params.id);
  if (!current) return notFound(res, 'User');
  const { payload, password } = sanitizeUserPayload(req.validated.body);
  payload.username ||= current.username || payload.email.split('@')[0];
  await validateUserAcademicProfile(payload);
  if (payload.committeeRoles?.length && payload.role !== 'INSTRUCTOR') {
    return res.status(400).json({ message: 'Committee duties can only be assigned to instructor accounts' });
  }
  const currentIsExamMember = (current.committeeRoles || []).includes('COURSE_EXAM_COMMITTEE');
  const requestedAsExamMember = (payload.committeeRoles || []).includes('COURSE_EXAM_COMMITTEE');
  if (currentIsExamMember !== requestedAsExamMember) {
    return res.status(400).json({ message: 'Assign Course and Exam Committee members from the semester committee page' });
  }
  if (req.user.role === 'HOD') {
    if (!['INSTRUCTOR', 'STUDENT'].includes(current.role) || !['INSTRUCTOR', 'STUDENT'].includes(payload.role)) {
      return res.status(403).json({ message: 'HOD users can only modify instructor or student accounts' });
    }
    if (!req.user.department || !sameId(current.department, req.user.department) || !sameId(payload.department, req.user.department)) {
      return res.status(403).json({ message: 'HOD users can only modify accounts in their department' });
    }
  }
  if (password && req.user.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ message: 'Only the Super Admin can reset an existing user password' });
  }
  const usernameConflict = await User.exists({
    _id: { $ne: current._id },
    $or: [{ username: payload.username }, { email: `${payload.username}@mtu.edu.et` }]
  });
  if (usernameConflict) return res.status(409).json({ message: 'Username already registered' });
  if (payload.role === 'SUPER_ADMIN') delete payload.department;
  if (current.registrationStatus && current.registrationStatus !== 'APPROVED') payload.isActive = false;
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
  const user = await User.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true }).select('firstName lastName username email role committeeRoles department studentNumber yearLevel gpa academicStream employeeNumber isActive registrationStatus reviewedBy reviewedAt createdAt').populate('department', 'name code').populate('reviewedBy', 'firstName lastName');
  res.json({ user });
});

export const reviewRegistration = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return notFound(res, 'User');
  if (!['INSTRUCTOR', 'STUDENT'].includes(user.role)) {
    return res.status(400).json({ message: 'Only student and instructor registrations can be reviewed' });
  }
  if (req.user.role === 'HOD' && (!req.user.department || !sameId(user.department, req.user.department))) {
    return res.status(403).json({ message: 'HOD users can only review registrations in their department' });
  }
  const approved = req.validated.body.status === 'APPROVED';
  user.registrationStatus = req.validated.body.status;
  user.isActive = approved;
  user.reviewedBy = req.user.id;
  user.reviewedAt = new Date();
  user.tokenVersion += 1;
  await user.save();
  const reviewed = await User.findById(user._id)
    .select('firstName lastName username email role committeeRoles department studentNumber yearLevel gpa academicStream employeeNumber isActive registrationStatus reviewedBy reviewedAt createdAt')
    .populate('department', 'name code')
    .populate('reviewedBy', 'firstName lastName');
  res.json({
    user: reviewed,
    message: approved ? 'Registration verified. The user can now sign in.' : 'Registration rejected.'
  });
});

export const upsertExamCommittee = asyncHandler(async (req, res) => {
  const { department, semester, members, chair } = req.validated.body;
  if (req.user.role === 'HOD' && department && !sameId(department, req.user.department)) {
    return res.status(403).json({ message: 'HOD users can only appoint their own department committee' });
  }
  const departmentId = req.user.role === 'SUPER_ADMIN' ? department : req.user.department;
  if (!departmentId) {
    return res.status(400).json({ message: req.user.role === 'SUPER_ADMIN' ? 'Select a department' : 'The HOD account must belong to a department' });
  }
  if (!(await Department.exists({ _id: departmentId }))) return notFound(res, 'Department');
  if (!(await Semester.exists({ _id: semester }))) return notFound(res, 'Semester');

  const instructors = await User.find({ _id: { $in: members }, role: 'INSTRUCTOR', department: departmentId, isActive: true });
  if (instructors.length !== 3) {
    return res.status(400).json({ message: 'Select exactly three active instructors from the selected department' });
  }

  const previous = await ExamCommittee.findOne({ department: departmentId, semester });
  const committee = await ExamCommittee.findOneAndUpdate(
    { department: departmentId, semester },
    { department: departmentId, semester, members, chair, appointedBy: req.user.id, status: 'ACTIVE' },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );

  await User.updateMany({ _id: { $in: members } }, { $addToSet: { committeeRoles: 'COURSE_EXAM_COMMITTEE' } });
  const removedMembers = (previous?.members || []).filter((member) => !members.includes(String(member)));
  for (const member of removedMembers) {
    const stillAppointed = await ExamCommittee.exists({ _id: { $ne: committee._id }, status: 'ACTIVE', members: member });
    if (!stillAppointed) await User.updateOne({ _id: member }, { $pull: { committeeRoles: 'COURSE_EXAM_COMMITTEE' } });
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
  const filter = {};
  if (req.user.role === 'SUPER_ADMIN') {
    if (req.query.department) filter.department = req.query.department;
  } else if (req.user.department) filter.department = req.user.department;
  else return res.status(403).json({ message: 'The HOD account must belong to a department' });

  const committees = await ExamCommittee.find(filter)
    .populate('department', 'name code')
    .populate('semester', 'name academicYear status')
    .populate('members', 'firstName lastName email employeeNumber academicStream')
    .populate('chair', 'firstName lastName email employeeNumber academicStream')
    .populate('appointedBy', 'firstName lastName email')
    .sort({ updatedAt: -1 });
  res.json({ committees });
});
