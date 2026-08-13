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
import { queueNotificationEmails } from '../services/notificationEmail.js';

function sameId(first, second) {
  return String(first?._id || first) === String(second?._id || second);
}

export const dashboardSummary = asyncHandler(async (req, res) => {
  const scopedDepartment = req.user.role === 'SUPER_ADMIN' ? null : req.user.department;
  if (req.user.role !== 'SUPER_ADMIN' && !scopedDepartment) {
    return res.status(403).json({ message: 'Your account is not assigned to a department' });
  }
  const courseFilter = scopedDepartment ? { department: scopedDepartment } : {};
  const departmentFilter = scopedDepartment ? { _id: scopedDepartment } : {};
  const userDepartmentFilter = scopedDepartment ? { department: scopedDepartment } : {};
  const evaluationFilter = scopedDepartment ? { department: scopedDepartment } : {};
  const notificationFilter = req.user.role === 'HOD' || (req.user.committeeRoles || []).includes('COURSE_EXAM_COMMITTEE')
    ? { $or: [{ user: req.user.id }, { audience: 'DEPARTMENT', department: scopedDepartment }, { audience: 'UNIVERSITY' }] }
    : { _id: null };
  const courseIdsPromise = scopedDepartment ? Course.distinct('_id', courseFilter) : Promise.resolve([]);
  const summaryPromise = Promise.all([
    Department.countDocuments(departmentFilter),
    Course.countDocuments(courseFilter),
    User.countDocuments({ role: 'STUDENT', ...userDepartmentFilter }),
    User.countDocuments({ role: 'INSTRUCTOR', ...userDepartmentFilter }),
    Evaluation.find(evaluationFilter).select('kind responses').lean(),
    Notification.find(notificationFilter).sort({ createdAt: -1 }).limit(30).populate('sender', 'firstName lastName role').lean()
  ]);
  const courseIds = await courseIdsPromise;
  const [assignments, [departments, courses, students, instructors, evaluations, notifications]] = await Promise.all([
    InstructorAssignment.find({
      status: 'PUBLISHED',
      ...(scopedDepartment ? { course: { $in: courseIds } } : {})
    }).select('enrolledStudents').lean(),
    summaryPromise
  ]);
  const expectedStudentEvaluations = assignments.reduce((sum, assignment) => sum + assignment.enrolledStudents.length, 0);
  const submittedStudentEvaluations = evaluations.filter((evaluation) => evaluation.kind === 'STUDENT').length;
  const completion = expectedStudentEvaluations ? Math.min(100, Math.round((submittedStudentEvaluations / expectedStudentEvaluations) * 100)) : 0;
  res.json({ totals: { departments, courses, students, instructors }, evaluationCompletion: completion, pendingEvaluations: Math.max(0, expectedStudentEvaluations - submittedStudentEvaluations), averageScores: categoryScores(evaluations), notifications });
});

export const instructorDashboard = asyncHandler(async (req, res) => {
  const instructorId = req.params.instructorId || req.user.id;
  const instructor = await User.findOne({ _id: instructorId, role: 'INSTRUCTOR' }).select('firstName lastName department').lean();
  if (!instructor) return res.status(404).json({ message: 'Instructor not found' });
  if (req.user.role === 'HOD' && (!req.user.department || String(req.user.department) !== String(instructor.department))) {
    return res.status(403).json({ message: 'You can only view instructors in your department' });
  }
  const [assignments, evaluations, peerCandidates, submittedPeerEvaluations, finalReports, notifications] = await Promise.all([
    InstructorAssignment.find({ instructor: instructorId })
      .populate('course')
      .populate('semester', 'name academicYear status')
      .populate('enrolledStudents', 'firstName lastName email studentNumber yearLevel academicStream')
      .lean(),
    Evaluation.find({ instructor: instructorId }).lean(),
    InstructorAssignment.find({ peerEvaluators: instructorId, instructor: { $ne: instructorId }, status: 'PUBLISHED' })
      .populate('instructor', 'firstName lastName email')
      .populate('course', 'code title level')
      .populate('semester', 'name academicYear')
      .lean(),
    PeerEvaluation.find({ evaluator: instructorId }).select('assignment').lean(),
    Report.find({ instructor: instructorId, status: 'PUBLISHED' })
      .sort({ publishedAt: -1, updatedAt: -1 })
      .populate('instructor', 'firstName lastName')
      .populate('semester', 'name academicYear')
      .populate('course', 'code title')
      .populate('publishedBy', 'firstName lastName role')
      .lean(),
    Notification.find({
      $or: [
        { user: instructorId },
        { audience: 'DEPARTMENT', department: instructor.department },
        { audience: 'UNIVERSITY' }
      ]
    }).sort({ createdAt: -1 }).limit(30).populate('sender', 'firstName lastName role').lean()
  ]);
  const byKind = { student: [], peer: [], hod: [] };
  const evaluationsByAssignment = new Map();
  const legacyEvaluationsByCourse = new Map();
  for (const evaluation of evaluations) {
    const kind = evaluation.kind?.toLowerCase();
    if (byKind[kind]) byKind[kind].push(evaluation);
    const collection = evaluation.assignment ? evaluationsByAssignment : legacyEvaluationsByCourse;
    const key = String(evaluation.assignment || evaluation.course || '');
    if (!key) continue;
    if (!collection.has(key)) collection.set(key, []);
    collection.get(key).push(evaluation);
  }
  const reportsByAssignment = new Map(finalReports
    .filter((report) => report.assignment)
    .map((report) => [String(report.assignment), report]));
  const courseReports = assignments.map((assignment) => {
    const courseEvaluations = [
      ...(evaluationsByAssignment.get(String(assignment._id)) || []),
      ...(legacyEvaluationsByCourse.get(String(assignment.course?._id || '')) || [])
    ];
    const courseByKind = {
      student: courseEvaluations.filter((item) => item.kind === 'STUDENT'),
      peer: courseEvaluations.filter((item) => item.kind === 'PEER'),
      hod: courseEvaluations.filter((item) => item.kind === 'HOD')
    };
    return {
      assignment: { _id: assignment._id, status: assignment.status },
      course: assignment.course,
      semester: assignment.semester,
      scores: weightedOverall(courseByKind),
      radar: categoryScores(courseEvaluations),
      evaluationCounts: { student: courseByKind.student.length, peer: courseByKind.peer.length, hod: courseByKind.hod.length, total: courseEvaluations.length },
      studentCompletionPercentage: assignment.enrolledStudents.length ? Math.min(100, Math.round((courseByKind.student.length / assignment.enrolledStudents.length) * 100)) : 0,
      finalReport: reportsByAssignment.get(String(assignment._id)) || null
    };
  });
  const finalReport = finalReports[0] || null;
  const completedPeerTargets = new Set(submittedPeerEvaluations.map((item) => String(item.assignment)));
  const peerTasks = peerCandidates.filter((assignment) => !evaluationWindowError(assignment) && !completedPeerTargets.has(String(assignment._id)));
  const enrolledStudents = assignments.reduce((sum, item) => sum + item.enrolledStudents.length, 0);
  const assignedStudentMap = new Map();
  for (const assignment of assignments) {
    for (const student of assignment.enrolledStudents) {
      const studentId = String(student._id);
      if (!assignedStudentMap.has(studentId)) assignedStudentMap.set(studentId, { ...student, courses: [] });
      const record = assignedStudentMap.get(studentId);
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
    finalReports,
    courseReports,
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
    if (!userId) return res.status(400).json({ message: 'Recipient is required' });
    user = await User.findOne({ _id: userId, role: { $in: ['INSTRUCTOR', 'STUDENT', 'HOD'] }, isActive: true });
    if (!user) return res.status(404).json({ message: 'Recipient not found' });
    if (!isUniversityAdmin && (!req.user.department || String(user.department) !== String(req.user.department))) {
      return res.status(403).json({ message: 'You can only notify people in your department' });
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
  const delivery = await queueNotificationEmails(notification);
  res.status(201).json({ notification, delivery, message: 'Notification published and email delivery queued' });
});
