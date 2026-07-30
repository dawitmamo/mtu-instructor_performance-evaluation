import PDFDocument from 'pdfkit';
import { User } from '../models/User.js';
import { Semester } from '../models/Semester.js';
import { Evaluation, StudentEvaluation, PeerEvaluation, HodEvaluation } from '../models/Evaluations.js';
import { Report } from '../models/Report.js';
import { Notification } from '../models/Notification.js';
import { InstructorAssignment } from '../models/InstructorAssignment.js';
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

function reportFileName(instructor, extension) {
  const safeLastName = String(instructor.lastName || '')
    .normalize('NFKD').replace(/[^\x20-\x7e]/g, '').replace(/[^a-z0-9._-]+/gi, '_')
    .replace(/^[_\.]+|[_\.]+$/g, '').slice(0, 80);
  return `${safeLastName || 'instructor'}-evaluation.${extension}`;
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

async function buildInstructorReport(instructorId, semesterId, generatedBy) {
  const instructor = await User.findOne({ _id: instructorId, role: 'INSTRUCTOR' }).populate('department', 'name faculty');
  if (!instructor) { const error = new Error('Instructor not found'); error.statusCode = 404; throw error; }
  if (!instructor.department) { const error = new Error('Instructor is not assigned to a department'); error.statusCode = 409; throw error; }
  const { semester, availableSemesters } = await resolveReportSemester(instructorId, semesterId);
  const filter = { instructor: instructorId };
  filter.semester = semester._id;
  const [student, peer, hod, assignments] = await Promise.all([
    StudentEvaluation.find(filter),
    PeerEvaluation.find(filter),
    HodEvaluation.find(filter),
    InstructorAssignment.find({ instructor: instructorId, semester: semester._id }).populate('course', 'code title')
  ]);
  const all = [...student, ...peer, ...hod];
  const scores = weightedOverall({ student, peer, hod });
  const categories = categoryScores(all);
  const strengths = categories.filter((item) => item.score >= 4).map((item) => item.category);
  const weaknesses = categories.filter((item) => item.score < 3.2).map((item) => item.category);
  const comments = all.map((item) => item.anonymousComment).filter(Boolean);
  const courseResults = assignments.map((assignment) => {
    const forAssignment = (evaluation) => sameId(evaluation.assignment, assignment._id)
      || (!evaluation.assignment && sameId(evaluation.course, assignment.course?._id));
    const courseScores = weightedOverall({
      student: student.filter(forAssignment),
      peer: peer.filter(forAssignment),
      hod: hod.filter(forAssignment)
    });
    return {
      course: assignment.course?._id,
      assignment: assignment._id,
      courseCode: assignment.course?.code || '',
      courseTitle: assignment.course?.title || '',
      studentScore: courseScores.studentScore,
      peerScore: courseScores.peerScore,
      hodScore: courseScores.hodScore,
      studentWeighted: courseScores.studentWeighted,
      peerWeighted: courseScores.peerWeighted,
      hodWeighted: courseScores.hodWeighted,
      finalScore: courseScores.overall
    };
  });
  const report = await Report.findOneAndUpdate(
    { instructor: instructorId, semester: semester._id },
    {
      instructor: instructorId,
      semester: semester._id,
      department: instructor.department._id,
      overallScore: scores.overall,
      categoryScores: categories,
      strengths,
      weaknesses,
      recommendations: [recommendationFor(scores.overall)],
      comments,
      sourceScores: { student: scores.studentScore, peer: scores.peerScore, hod: scores.hodScore },
      weightedContributions: { student: scores.studentWeighted, peer: scores.peerWeighted, hod: scores.hodWeighted },
      courseResults,
      generatedBy
    },
    { upsert: true, new: true, runValidators: true }
  );
  return {
    instructor,
    semester,
    availableSemesters,
    evaluationCounts: { student: student.length, peer: peer.length, hod: hod.length, total: all.length },
    report,
    scores,
    courseResults
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
  const { semester } = req.validated.query;
  const { report, courseResults } = await buildInstructorReport(instructorId, semester, req.user.id);
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
      message: `Your final performance report for ${courseResults.map((item) => `${item.courseCode} - ${item.courseTitle}`).join(', ') || 'your assigned courses'} has been published. Final weighted result: ${report.overallScore}/5.`,
      type: 'REPORT'
    },
    { upsert: true, new: true, runValidators: true }
  );
  const published = await Report.findById(report._id)
    .populate('instructor', 'firstName lastName')
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
  const { instructor, report, scores, courseResults } = await buildInstructorReport(instructorId, semester, req.user.id);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="' + reportFileName(instructor, 'pdf') + '"');
  const doc = new PDFDocument({ margin: 48 });
  doc.pipe(res);
  doc.fontSize(18).text('Instructor Performance Evaluation Report');
  doc.moveDown();
  doc.fontSize(12).text(`Instructor: ${instructor.name}`);
  doc.text(`Course(s): ${courseResults.map((item) => `${item.courseCode} - ${item.courseTitle}`).join(', ') || 'No assigned course'}`);
  doc.text(`Final Result: ${scores.overall} / 5`);
  doc.text(`Student 40%: ${scores.studentScore} x 40% = ${scores.studentWeighted}`);
  doc.text(`Peer 30%: ${scores.peerScore} x 30% = ${scores.peerWeighted}`);
  doc.text(`HOD 30%: ${scores.hodScore} x 30% = ${scores.hodWeighted}`);
  if (courseResults.length) {
    doc.moveDown().text('Course Results');
    courseResults.forEach((item) => doc.text(`${item.courseCode} - ${item.courseTitle}: ${item.finalScore} / 5`));
  }
  doc.moveDown().text('Category Scores');
  report.categoryScores.forEach((item) => doc.text(`${item.category}: ${item.score}`));
  doc.moveDown().text('Recommendations');
  report.recommendations.forEach((item) => doc.text(`- ${item}`));
  doc.end();
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
  const { semester } = req.validated.query;
  const { instructor, report, scores, courseResults } = await buildInstructorReport(instructorId, semester, req.user.id);
  const rows = [
    ['Metric', 'Value'],
    ['Instructor', instructor.name],
    ['Courses', courseResults.map((item) => `${item.courseCode} - ${item.courseTitle}`).join('; ')],
    ['Final Result (out of 5)', scores.overall],
    ['Student Raw Score', scores.studentScore],
    ['Student 40% Contribution', scores.studentWeighted],
    ['Peer Raw Score', scores.peerScore],
    ['Peer 30% Contribution', scores.peerWeighted],
    ['HOD Raw Score', scores.hodScore],
    ['HOD 30% Contribution', scores.hodWeighted],
    [],
    ['Course', 'Student 40%', 'Peer 30%', 'HOD 30%', 'Final Result'],
    ...courseResults.map((item) => [
      `${item.courseCode} - ${item.courseTitle}`,
      item.studentWeighted,
      item.peerWeighted,
      item.hodWeighted,
      item.finalScore
    ]),
    [],
    ['Category', 'Score'],
    ...report.categoryScores.map((item) => [item.category, item.score]),
    [],
    ['Recommendations', report.recommendations.join('; ')]
  ];
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="' + reportFileName(instructor, 'csv') + '"');
  res.send(csv);
});
export const getDepartmentReport = asyncHandler(async (req, res) => {
  if (req.user.role === 'HOD' && (!req.user.department || !sameId(req.user.department, req.params.departmentId))) {
    return res.status(403).json({ message: 'You can only view your department report' });
  }
  const evaluations = await Evaluation.find({ department: req.params.departmentId });
  res.json({ totalEvaluations: evaluations.length, categoryScores: categoryScores(evaluations) });
});



