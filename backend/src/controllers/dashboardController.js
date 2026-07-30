import { User } from '../models/User.js';
import { Department } from '../models/Department.js';
import { Course } from '../models/Course.js';
import { InstructorAssignment } from '../models/InstructorAssignment.js';
import { Evaluation, PeerEvaluation } from '../models/Evaluations.js';
import { Report } from '../models/Report.js';
import { Notification } from '../models/Notification.js';
import { categoryScores, weightedOverall } from '../utils/score.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { evaluationWindowError } from '../utils/evaluationWindow.js';

export const dashboardSummary = asyncHandler(async (req, res) => {
  const scopedDepartment = req.user.role === 'SUPER_ADMIN' ? null : req.user.department;
  if (req.user.role !== 'SUPER_ADMIN' && !scopedDepartment) {
    return res.status(403).json({ message: 'Your account is not assigned to a department' });
  }
  const courseFilter = scopedDepartment ? { department: scopedDepartment } : {};
  const departmentFilter = scopedDepartment ? { _id: scopedDepartment } : {};
  const userDepartmentFilter = scopedDepartment ? { department: scopedDepartment } : {};
  const evaluationFilter = scopedDepartment ? { department: scopedDepartment } : {};
  const courseIds = scopedDepartment ? (await Course.find(courseFilter).select('_id')).map((course) => course._id) : [];
  const assignments = await InstructorAssignment.find({
    status: 'PUBLISHED',
    ...(scopedDepartment ? { course: { $in: courseIds } } : {})
  }).select('enrolledStudents');
  const notificationFilter = req.user.role === 'HOD' || (req.user.committeeRoles || []).includes('COURSE_EXAM_COMMITTEE')
    ? { $or: [{ user: req.user.id }, { audience: 'DEPARTMENT', department: scopedDepartment }, { audience: 'UNIVERSITY' }] }
    : { _id: null };
  const [departments, courses, students, instructors, evaluations, notifications] = await Promise.all([
    Department.countDocuments(departmentFilter),
    Course.countDocuments(courseFilter),
    User.countDocuments({ role: 'STUDENT', ...userDepartmentFilter }),
    User.countDocuments({ role: 'INSTRUCTOR', ...userDepartmentFilter }),
    Evaluation.find(evaluationFilter),
    Notification.find(notificationFilter).sort({ createdAt: -1 }).limit(30).populate('sender', 'firstName lastName role')
  ]);
  const expectedStudentEvaluations = assignments.reduce((sum, assignment) => sum + assignment.enrolledStudents.length, 0);
  const submittedStudentEvaluations = evaluations.filter((evaluation) => evaluation.kind === 'STUDENT').length;
  const completion = expectedStudentEvaluations ? Math.min(100, Math.round((submittedStudentEvaluations / expectedStudentEvaluations) * 100)) : 0;
  res.json({ totals: { departments, courses, students, instructors }, evaluationCompletion: completion, pendingEvaluations: Math.max(0, expectedStudentEvaluations - submittedStudentEvaluations), averageScores: categoryScores(evaluations), notifications });
});

export const instructorDashboard = asyncHandler(async (req, res) => {
  const instructorId = req.params.instructorId || req.user.id;
  const instructor = await User.findOne({ _id: instructorId, role: 'INSTRUCTOR' }).select('firstName lastName department');
  if (!instructor) return res.status(404).json({ message: 'Instructor not found' });
  if (req.user.role === 'HOD' && (!req.user.department || String(req.user.department) !== String(instructor.department))) {
    return res.status(403).json({ message: 'You can only view instructors in your department' });
  }
  const [assignments, evaluations, peerCandidates, submittedPeerEvaluations, finalReport, notifications] = await Promise.all([
    InstructorAssignment.find({ instructor: instructorId })
      .populate('course')
      .populate('semester', 'name academicYear status')
      .populate('enrolledStudents', 'firstName lastName email studentNumber yearLevel academicStream'),
    Evaluation.find({ instructor: instructorId }),
    InstructorAssignment.find({ peerEvaluators: instructorId, instructor: { $ne: instructorId }, status: 'PUBLISHED' })
      .populate('instructor', 'firstName lastName email')
      .populate('course', 'code title level')
      .populate('semester', 'name academicYear'),
    PeerEvaluation.find({ evaluator: instructorId }).select('assignment'),
    Report.findOne({ instructor: instructorId, status: 'PUBLISHED' })
      .sort({ publishedAt: -1, updatedAt: -1 })
      .populate('instructor', 'firstName lastName')
      .populate('semester', 'name academicYear')
      .populate('publishedBy', 'firstName lastName role'),
    Notification.find({
      $or: [
        { user: instructorId },
        { audience: 'DEPARTMENT', department: instructor.department },
        { audience: 'UNIVERSITY' }
      ]
    }).sort({ createdAt: -1 }).limit(30).populate('sender', 'firstName lastName role')
  ]);
  const byKind = { student: evaluations.filter((item) => item.kind === 'STUDENT'), peer: evaluations.filter((item) => item.kind === 'PEER'), hod: evaluations.filter((item) => item.kind === 'HOD') };
  const completedPeerTargets = new Set(submittedPeerEvaluations.map((item) => String(item.assignment)));
  const peerTasks = peerCandidates.filter((assignment) => !evaluationWindowError(assignment) && !completedPeerTargets.has(String(assignment._id)));
  const enrolledStudents = assignments.reduce((sum, item) => sum + item.enrolledStudents.length, 0);
  const assignedStudentMap = new Map();
  for (const assignment of assignments) {
    for (const student of assignment.enrolledStudents) {
      if (!assignedStudentMap.has(student.id)) assignedStudentMap.set(student.id, { ...student.toObject(), courses: [] });
      const record = assignedStudentMap.get(student.id);
      if (assignment.course && !record.courses.some((course) => String(course._id) === String(assignment.course._id))) {
        record.courses.push({ _id: assignment.course._id, code: assignment.course.code, title: assignment.course.title });
      }
    }
  }
  res.json({
    instructor,
    assignments,
    enrolledStudents,
    assignedStudents: [...assignedStudentMap.values()],
    peerTasks,
    scores: weightedOverall(byKind),
    radar: categoryScores(evaluations),
    finalReport,
    notifications,
    completionPercentage: enrolledStudents ? Math.min(100, Math.round((byKind.student.length / enrolledStudents) * 100)) : 0
  });
});

export const createNotification = asyncHandler(async (req, res) => {
  const { title, message, type = 'INFO', audience, user: userId, department: departmentId } = req.validated.body;
  const isUniversityAdmin = req.user.role === 'SUPER_ADMIN';
  if (audience === 'UNIVERSITY' && !isUniversityAdmin) {
    return res.status(403).json({ message: 'Only Super Admin can publish university-wide notifications' });
  }

  let user;
  let department;
  if (audience === 'USER') {
    if (!userId) return res.status(400).json({ message: 'Staff recipient is required' });
    user = await User.findOne({ _id: userId, role: { $in: ['INSTRUCTOR', 'HOD'] }, isActive: true });
    if (!user) return res.status(404).json({ message: 'Staff recipient not found' });
    if (!isUniversityAdmin && (!req.user.department || String(user.department) !== String(req.user.department))) {
      return res.status(403).json({ message: 'You can only notify instructors in your department' });
    }
  }
  if (audience === 'DEPARTMENT') {
    department = isUniversityAdmin ? departmentId : req.user.department;
    if (!department) return res.status(400).json({ message: 'Department is required for this notification' });
    if (!await Department.exists({ _id: department })) return res.status(404).json({ message: 'Department not found' });
  }

  const notification = await Notification.create({
    title,
    message,
    type,
    audience,
    user: user?._id,
    department,
    sender: req.user.id
  });
  res.status(201).json({ notification, message: 'Notification published' });
});
