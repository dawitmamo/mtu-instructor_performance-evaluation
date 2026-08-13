import { User } from '../models/User.js';
import { Semester } from '../models/Semester.js';
import { Evaluation } from '../models/Evaluations.js';
import { Report } from '../models/Report.js';
import { Notification } from '../models/Notification.js';
import { InstructorAssignment } from '../models/InstructorAssignment.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { categoryScores, weightedOverall } from '../utils/score.js';
import { renderInstructorCourseReportPdf } from '../utils/reportPdf.js';
import { queueNotificationEmails } from '../services/notificationEmail.js';

function sameId(first, second) {
  return String(first?._id || first) === String(second?._id || second);
}

function recommendationFor(score) {
  if (score >= 90) return 'Sustain excellent teaching practice and mentor peers.';
  if (score >= 76) return 'Maintain strengths while refining lower scoring categories.';
  if (score >= 60) return 'Create a focused improvement plan with peer coaching.';
  return 'Schedule HOD support, teaching observation, and follow-up development actions.';
}

function reportFileName(instructor, course, extension) {
  const safeLastName = String(instructor.lastName || '')
    .normalize('NFKD').replace(/[^\x20-\x7e]/g, '').replace(/[^a-z0-9._-]+/gi, '_')
    .replace(/^[_\.]+|[_\.]+$/g, '').slice(0, 80);
  const safeCourse = String(course?.code || 'course').replace(/[^a-z0-9._-]+/gi, '_').slice(0, 40);
  return `${safeLastName || 'instructor'}-${safeCourse}-evaluation.${extension}`;
}

async function resolveReportSemester(instructorId, requestedSemesterId) {
  const [evaluationSemesterIds, assignmentSemesterIds] = await Promise.all([
    Evaluation.distinct('semester', { instructor: instructorId }),
    InstructorAssignment.distinct('semester', { instructor: instructorId })
  ]);
  const relevantIds = [...new Set([...evaluationSemesterIds, ...assignmentSemesterIds].map(String))];
  const availableSemesters = relevantIds.length
    ? await Semester.find({ _id: { $in: relevantIds } }).sort({ startsAt: -1 })
    : [];

  if (requestedSemesterId) {
    const requested = await Semester.findById(requestedSemesterId);
    if (!requested) { const error = new Error('Semester not found'); error.statusCode = 404; throw error; }
    if (!availableSemesters.some((item) => sameId(item, requested))) availableSemesters.unshift(requested);
    return { semester: requested, availableSemesters };
  }

  const evaluatedIds = new Set(evaluationSemesterIds.map(String));
  const semester = availableSemesters.find((item) => evaluatedIds.has(String(item._id)))
    || availableSemesters[0]
    || await Semester.findOne().sort({ startsAt: -1 });
  if (!semester) { const error = new Error('Semester not found'); error.statusCode = 404; throw error; }
  return { semester, availableSemesters: availableSemesters.length ? availableSemesters : [semester] };
}

async function buildInstructorReport(instructorId, semesterId, assignmentId, generatedBy) {
  const instructor = await User.findOne({ _id: instructorId, role: 'INSTRUCTOR' }).populate('department', 'name code faculty');
  if (!instructor) { const error = new Error('Instructor not found'); error.statusCode = 404; throw error; }
  if (!instructor.department) { const error = new Error('Instructor is not assigned to a department'); error.statusCode = 409; throw error; }
  const { semester, availableSemesters } = await resolveReportSemester(instructorId, semesterId);
  const [evaluations, assignments] = await Promise.all([
    Evaluation.find({ instructor: instructorId, semester: semester._id }).select('kind responses anonymousComment assignment course submittedAt').lean(),
    InstructorAssignment.find({ instructor: instructorId, semester: semester._id })
      .populate('course', 'code title creditHours level yearLevel academicStream')
      .sort({ createdAt: 1 })
      .lean()
  ]);
  const selectedAssignment = assignmentId
    ? assignments.find((assignment) => sameId(assignment, assignmentId))
    : assignments.find((assignment) => evaluations.some((evaluation) => sameId(evaluation.assignment, assignment._id)
      || (!evaluation.assignment && sameId(evaluation.course, assignment.course?._id)))) || assignments[0];
  if (!selectedAssignment) {
    const error = new Error(assignmentId ? 'Course assignment not found for this instructor and semester' : 'No course assignment found for this instructor and semester');
    error.statusCode = 404;
    throw error;
  }
  if (!selectedAssignment.course) { const error = new Error('The selected course is no longer available'); error.statusCode = 409; throw error; }
  const all = evaluations.filter((evaluation) => sameId(evaluation.assignment, selectedAssignment._id)
    || (!evaluation.assignment && sameId(evaluation.course, selectedAssignment.course._id)));
  const student = all.filter((evaluation) => evaluation.kind === 'STUDENT');
  const peer = all.filter((evaluation) => evaluation.kind === 'PEER');
  const hod = all.filter((evaluation) => evaluation.kind === 'HOD');
  const scores = weightedOverall({ student, peer, hod });
  const categories = categoryScores(all);
  const strengths = categories.filter((item) => item.score >= 4).map((item) => item.category);
  const weaknesses = categories.filter((item) => item.score < 3.2).map((item) => item.category);
  const comments = all.map((item) => item.anonymousComment).filter(Boolean);
  const courseResult = {
    course: selectedAssignment.course._id,
    assignment: selectedAssignment._id,
    courseCode: selectedAssignment.course.code || '',
    courseTitle: selectedAssignment.course.title || '',
    studentScore: scores.studentScore,
    peerScore: scores.peerScore,
    hodScore: scores.hodScore,
    studentWeighted: scores.studentWeighted,
    peerWeighted: scores.peerWeighted,
    hodWeighted: scores.hodWeighted,
    finalScore: scores.overall
  };
  const report = await Report.findOneAndUpdate(
    { instructor: instructorId, semester: semester._id, assignment: selectedAssignment._id },
    {
      instructor: instructorId,
      semester: semester._id,
      department: instructor.department._id,
      course: selectedAssignment.course._id,
      assignment: selectedAssignment._id,
      overallScore: scores.overall,
      categoryScores: categories,
      strengths,
      weaknesses,
      recommendations: [recommendationFor(scores.overall)],
      comments,
      sourceScores: { student: scores.studentScore, peer: scores.peerScore, hod: scores.hodScore },
      weightedContributions: { student: scores.studentWeighted, peer: scores.peerWeighted, hod: scores.hodWeighted },
      courseResults: [courseResult],
      generatedBy
    },
    { upsert: true, new: true, runValidators: true }
  );
  return {
    instructor,
    semester,
    availableSemesters,
    assignment: selectedAssignment,
    course: selectedAssignment.course,
    availableAssignments: assignments,
    evaluationCounts: { student: student.length, peer: peer.length, hod: hod.length, total: all.length },
    report,
    scores,
    courseResults: [courseResult]
  };
}

async function canAccessInstructor(req, instructorId) {
  if (req.user.role === 'SUPER_ADMIN') return true;
  if (req.user.role === 'INSTRUCTOR' && req.user.id === instructorId) return true;
  if (req.user.role === 'HOD' && req.user.department) {
    return Boolean(await User.exists({ _id: instructorId, role: 'INSTRUCTOR', department: req.user.department }));
  }
  if ((req.user.committeeRoles || []).includes('COURSE_EXAM_COMMITTEE') && req.user.department) {
    return Boolean(await User.exists({ _id: instructorId, role: 'INSTRUCTOR', department: req.user.department }));
  }
  return false;
}

export const publishInstructorReport = asyncHandler(async (req, res) => {
  const { instructorId } = req.validated.params;
  const canPublish = req.user.role === 'HOD' || (req.user.committeeRoles || []).includes('COURSE_EXAM_COMMITTEE');
  if (!canPublish || !(await canAccessInstructor(req, instructorId))) {
    return res.status(403).json({ message: 'Only the instructor department HOD or an appointed Course and Exam Committee member can publish this summary' });
  }
  const { semester, assignment } = req.validated.query;
  const { report, course } = await buildInstructorReport(instructorId, semester, assignment, req.user.id);
  report.status = 'PUBLISHED';
  report.finalSummary = req.validated.body.finalSummary;
  report.publishedBy = req.user.id;
  report.publishedAt = new Date();
  await report.save();
  const notification = await Notification.findOneAndUpdate(
    { user: instructorId, relatedReport: report._id },
    {
      user: instructorId,
      audience: 'USER',
      sender: req.user.id,
      relatedReport: report._id,
      title: `Final evaluation report published - ${course.code}`,
      message: `Your final performance report for ${course.code} - ${course.title} has been published. Final weighted result: ${report.overallScore}%.`,
      type: 'REPORT'
    },
    { upsert: true, new: true, runValidators: true }
  );
  await queueNotificationEmails(notification);
  const published = await Report.findById(report._id)
    .populate('instructor', 'firstName lastName')
    .populate('semester', 'name academicYear')
    .populate('course', 'code title')
    .populate('assignment', 'course semester')
    .populate('publishedBy', 'firstName lastName role');
  res.json({ report: published, message: 'Final summary published to the instructor' });
});

export const getInstructorReport = asyncHandler(async (req, res) => {
  const { instructorId } = req.validated.params;
  if (!(await canAccessInstructor(req, instructorId))) return res.status(403).json({ message: 'You cannot view this instructor report' });
  const { semester, assignment } = req.validated.query;
  res.json(await buildInstructorReport(instructorId, semester, assignment, req.user.id));
});

export const downloadInstructorPdf = asyncHandler(async (req, res) => {
  const { instructorId } = req.validated.params;
  if (!(await canAccessInstructor(req, instructorId))) return res.status(403).json({ message: 'You cannot download this instructor report' });
  const { semester, assignment } = req.validated.query;
  const result = await buildInstructorReport(instructorId, semester, assignment, req.user.id);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="' + reportFileName(result.instructor, result.course, 'pdf') + '"');
  renderInstructorCourseReportPdf(res, { ...result, department: result.instructor.department });
});


function csvCell(value) {
  const text = String(value ?? '');
  // Spreadsheet applications treat these prefixes as formulas even in CSV
  // files. Prefix user-controlled cells so opening an export cannot execute a
  // formula supplied through an instructor or template name.
  const safeText = /^[=+\-@\t\r]/.test(text) ? "'" + text : text;
  return /[",\r\n]/.test(safeText) ? '"' + safeText.replaceAll('"', '""') + '"' : safeText;
}

export const downloadInstructorExcel = asyncHandler(async (req, res) => {
  const { instructorId } = req.validated.params;
  if (!(await canAccessInstructor(req, instructorId))) return res.status(403).json({ message: 'You cannot download this instructor report' });
  const { semester, assignment } = req.validated.query;
  const { instructor, semester: reportSemester, assignment: courseAssignment, course, report, scores, evaluationCounts } = await buildInstructorReport(instructorId, semester, assignment, req.user.id);
  const rows = [
    ['MIZAN-TEPI UNIVERSITY'],
    ['Academic Management and Instructor Performance Evaluation System'],
    ['COURSE PERFORMANCE EVALUATION REPORT'],
    [],
    ['Report Details'],
    ['Instructor', instructor.name],
    ['Department', instructor.department.name],
    ['Department Code', instructor.department.code],
    ['Faculty', instructor.department.faculty],
    ['Course Code', course.code],
    ['Course Title', course.title],
    ['Credit Hours', course.creditHours],
    ['Class / Year', course.yearLevel ? `Year ${course.yearLevel}` : course.level || 'Not specified'],
    ['Academic Stream', course.academicStream ? course.academicStream.replaceAll('_', ' ') : 'General program'],
    ['Semester', reportSemester.name],
    ['Academic Year', reportSemester.academicYear],
    ['Assignment Status', courseAssignment.status],
    ['Report Status', report.status],
    ['Generated At', new Date().toISOString()],
    [],
    ['Score Summary', 'Rating / Contribution', 'Maximum Weight', 'Submitted Evaluations'],
    ['Final Result (out of 100%)', scores.overall],
    ['Student evaluation', `${scores.studentScore}/5 -> ${scores.studentWeighted}%`, '40%', evaluationCounts.student],
    ['Peer evaluation', `${scores.peerScore}/5 -> ${scores.peerWeighted}%`, '30%', evaluationCounts.peer],
    ['HOD evaluation', `${scores.hodScore}/5 -> ${scores.hodWeighted}%`, '30%', evaluationCounts.hod],
    [],
    ['Category Performance', 'Score out of 5'],
    ...report.categoryScores.map((item) => [item.category, item.score]),
    [],
    ['Strengths'],
    ...(report.strengths.length ? report.strengths.map((item) => [item]) : [['None identified yet']]),
    [],
    ['Areas for Improvement'],
    ...(report.weaknesses.length ? report.weaknesses.map((item) => [item]) : [['None identified']]),
    [],
    ['Recommendations'],
    ...report.recommendations.map((item) => [item]),
    ...(report.finalSummary ? [[], ['Published Final Summary'], [report.finalSummary]] : []),
    ...(report.comments.length ? [[], ['Anonymous Feedback'], ...report.comments.map((item) => [item])] : [])
  ];
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="' + reportFileName(instructor, course, 'csv') + '"');
  res.send(csv);
});
export const getDepartmentReport = asyncHandler(async (req, res) => {
  if (req.user.role === 'HOD' && (!req.user.department || !sameId(req.user.department, req.params.departmentId))) {
    return res.status(403).json({ message: 'You can only view your department report' });
  }
  const evaluations = await Evaluation.find({ department: req.params.departmentId }).select('responses').lean();
  res.json({ totalEvaluations: evaluations.length, categoryScores: categoryScores(evaluations) });
});



