import { User } from '../models/User.js';
import { Department } from '../models/Department.js';
import { Course } from '../models/Course.js';
import { InstructorAssignment } from '../models/InstructorAssignment.js';
import { Evaluation, PeerEvaluation } from '../models/Evaluations.js';
import { EvaluationKey } from '../models/EvaluationKey.js';
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
  const assignmentIds = scopedDepartment ? (await InstructorAssignment.find({ course: { $in: courseIds } }).select('_id')).map((assignment) => assignment._id) : [];
  const keyFilter = scopedDepartment ? { assignment: { $in: assignmentIds } } : {};
  const notificationFilter = req.user.role === 'HOD'
    ? { $or: [{ user: req.user.id }, { audience: 'DEPARTMENT', department: scopedDepartment }, { audience: 'UNIVERSITY' }] }
    : { _id: null };
  const [departments, courses, students, instructors, evaluations, keys, notifications] = await Promise.all([
    Department.countDocuments(departmentFilter),
    Course.countDocuments(courseFilter),
    User.countDocuments({ role: 'STUDENT', ...userDepartmentFilter }),
    User.countDocuments({ role: 'INSTRUCTOR', ...userDepartmentFilter }),
    Evaluation.find(evaluationFilter),
    EvaluationKey.find(keyFilter),
    Notification.find(notificationFilter).sort({ createdAt: -1 }).limit(30).populate('sender', 'firstName lastName role')
  ]);
  const completion = keys.length ? Math.round((keys.filter((key) => key.usedAt).length / keys.length) * 100) : 0;
  res.json({ totals: { departments, courses, students, instructors }, evaluationCompletion: completion, pendingEvaluations: keys.filter((key) => !key.usedAt).length, averageScores: categoryScores(evaluations), notifications });
});

export const instructorDashboard = asyncHandler(async (req, res) => {
  const instructorId = req.params.instructorId || req.user.id;
  const instructor = await User.findById(instructorId).select('department');
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
    PeerEvaluation.find({ evaluator: instructorId }).select('instructor semester'),
    Report.findOne({ instructor: instructorId, status: 'PUBLISHED' })
      .sort({ publishedAt: -1, updatedAt: -1 })
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
  const completedPeerTargets = new Set(submittedPeerEvaluations.map((item) => `${item.instructor}:${item.semester}`));
  const peerTasks = peerCandidates.filter((assignment) => !evaluationWindowError(assignment) && !completedPeerTargets.has(`${assignment.instructor?._id}:${assignment.semester?._id}`));
  const enrolledStudents = assignments.reduce((sum, item) => sum + item.enrolledStudents.length, 0);
  res.json({
    assignments,
    enrolledStudents,
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
