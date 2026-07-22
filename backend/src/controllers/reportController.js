import PDFDocument from 'pdfkit';
import { User } from '../models/User.js';
import { Semester } from '../models/Semester.js';
import { Evaluation, StudentEvaluation, PeerEvaluation, HodEvaluation } from '../models/Evaluations.js';
import { Report } from '../models/Report.js';
import { Notification } from '../models/Notification.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { categoryScores, weightedOverall } from '../utils/score.js';

function sameId(first, second) {
  return String(first?._id || first) === String(second?._id || second);
}

function recommendationFor(score) {
  if (score >= 4.5) return 'Sustain excellent teaching practice and mentor peers.';
  if (score >= 3.8) return 'Maintain strengths while refining lower scoring categories.';
  if (score >= 3) return 'Create a focused improvement plan with peer coaching.';
  return 'Schedule HOD support, teaching observation, and follow-up development actions.';
}

async function buildInstructorReport(instructorId, semesterId, generatedBy) {
  const instructor = await User.findById(instructorId).populate('department', 'name faculty');
  if (!instructor) { const error = new Error('Instructor not found'); error.statusCode = 404; throw error; }
  const semester = semesterId ? await Semester.findById(semesterId) : await Semester.findOne().sort({ startsAt: -1 });
  const filter = { instructor: instructorId };
  if (semester) filter.semester = semester._id;
  const [student, peer, hod] = await Promise.all([StudentEvaluation.find(filter), PeerEvaluation.find(filter), HodEvaluation.find(filter)]);
  const all = [...student, ...peer, ...hod];
  const scores = weightedOverall({ student, peer, hod });
  const categories = categoryScores(all);
  const strengths = categories.filter((item) => item.score >= 4).map((item) => item.category);
  const weaknesses = categories.filter((item) => item.score < 3.2).map((item) => item.category);
  const comments = all.map((item) => item.anonymousComment).filter(Boolean);
  const report = await Report.findOneAndUpdate({ instructor: instructorId, semester: semester?._id }, { instructor: instructorId, semester: semester?._id, department: instructor.department?._id, overallScore: scores.overall, categoryScores: categories, strengths, weaknesses, recommendations: [recommendationFor(scores.overall)], comments, sourceScores: { student: scores.studentScore, peer: scores.peerScore, hod: scores.hodScore }, generatedBy }, { upsert: true, new: true, runValidators: true });
  return { instructor, semester, report, scores };
}

async function canAccessInstructor(req, instructorId) {
  if (req.user.role === 'SUPER_ADMIN') return true;
  if (req.user.role === 'INSTRUCTOR' && req.user.id === instructorId) return true;
  if (req.user.role === 'HOD' && req.user.department) {
    return Boolean(await User.exists({ _id: instructorId, role: 'INSTRUCTOR', department: req.user.department }));
  }
  if (req.user.role === 'EXAM_COMMITTEE' && req.user.department) {
    return Boolean(await User.exists({ _id: instructorId, role: 'INSTRUCTOR', department: req.user.department }));
  }
  if ((req.user.committeeRoles || []).some((role) => ['COURSE_COMMITTEE', 'EXAM_COMMITTEE'].includes(role)) && req.user.department) {
    return Boolean(await User.exists({ _id: instructorId, role: 'INSTRUCTOR', department: req.user.department }));
  }
  return false;
}

export const publishInstructorReport = asyncHandler(async (req, res) => {
  const { instructorId } = req.validated.params;
  const canPublish = ['HOD', 'EXAM_COMMITTEE'].includes(req.user.role) || (req.user.committeeRoles || []).some((role) => ['COURSE_COMMITTEE', 'EXAM_COMMITTEE'].includes(role));
  if (!canPublish || !(await canAccessInstructor(req, instructorId))) {
    return res.status(403).json({ message: 'Only the instructor department HOD or an appointed Course/Exam Committee member can publish this summary' });
  }
  const { semester } = req.validated.query;
  const { report } = await buildInstructorReport(instructorId, semester, req.user.id);
  report.status = 'PUBLISHED';
  report.finalSummary = req.validated.body.finalSummary;
  report.publishedBy = req.user.id;
  report.publishedAt = new Date();
  await report.save();
  await Notification.findOneAndUpdate(
    { user: instructorId, relatedReport: report._id },
    {
      user: instructorId,
      audience: 'USER',
      sender: req.user.id,
      relatedReport: report._id,
      title: 'Final evaluation summary published',
      message: 'Your department has published your final instructor performance evaluation summary.',
      type: 'REPORT'
    },
    { upsert: true, new: true, runValidators: true }
  );
  const published = await Report.findById(report._id)
    .populate('semester', 'name academicYear')
    .populate('publishedBy', 'firstName lastName role');
  res.json({ report: published, message: 'Final summary published to the instructor' });
});

export const getInstructorReport = asyncHandler(async (req, res) => {
  const { instructorId } = req.validated.params;
  if (!(await canAccessInstructor(req, instructorId))) return res.status(403).json({ message: 'You cannot view this instructor report' });
  const { semester } = req.validated.query;
  res.json(await buildInstructorReport(instructorId, semester, req.user.id));
});

export const downloadInstructorPdf = asyncHandler(async (req, res) => {
  const { instructorId } = req.validated.params;
  if (!(await canAccessInstructor(req, instructorId))) return res.status(403).json({ message: 'You cannot download this instructor report' });
  const { semester } = req.validated.query;
  const { instructor, report, scores } = await buildInstructorReport(instructorId, semester, req.user.id);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${instructor.lastName}-evaluation.pdf"`);
  const doc = new PDFDocument({ margin: 48 });
  doc.pipe(res);
  doc.fontSize(18).text('Instructor Performance Evaluation Report');
  doc.moveDown();
  doc.fontSize(12).text(`Instructor: ${instructor.name}`);
  doc.text(`Overall Score: ${scores.overall}`);
  doc.text(`Student: ${scores.studentScore} | Peer: ${scores.peerScore} | HOD: ${scores.hodScore}`);
  doc.moveDown().text('Category Scores');
  report.categoryScores.forEach((item) => doc.text(`${item.category}: ${item.score}`));
  doc.moveDown().text('Recommendations');
  report.recommendations.forEach((item) => doc.text(`- ${item}`));
  doc.end();
});


function csvCell(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export const downloadInstructorExcel = asyncHandler(async (req, res) => {
  const { instructorId } = req.validated.params;
  if (!(await canAccessInstructor(req, instructorId))) return res.status(403).json({ message: 'You cannot download this instructor report' });
  const { semester } = req.validated.query;
  const { instructor, report, scores } = await buildInstructorReport(instructorId, semester, req.user.id);
  const rows = [
    ['Metric', 'Value'],
    ['Instructor', instructor.name],
    ['Overall Score', scores.overall],
    ['Student Score', scores.studentScore],
    ['Peer Score', scores.peerScore],
    ['HOD Score', scores.hodScore],
    [],
    ['Category', 'Score'],
    ...report.categoryScores.map((item) => [item.category, item.score]),
    [],
    ['Recommendations', report.recommendations.join('; ')]
  ];
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${instructor.lastName}-evaluation.csv"`);
  res.send(csv);
});
export const getDepartmentReport = asyncHandler(async (req, res) => {
  if (req.user.role === 'HOD' && (!req.user.department || !sameId(req.user.department, req.params.departmentId))) {
    return res.status(403).json({ message: 'You can only view your department report' });
  }
  const evaluations = await Evaluation.find({ department: req.params.departmentId });
  res.json({ totalEvaluations: evaluations.length, categoryScores: categoryScores(evaluations) });
});



