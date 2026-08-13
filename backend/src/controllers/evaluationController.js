import { InstructorAssignment } from '../models/InstructorAssignment.js';
import { Course } from '../models/Course.js';
import { EvaluationTemplate } from '../models/EvaluationTemplate.js';
import { StudentEvaluation, PeerEvaluation, HodEvaluation } from '../models/Evaluations.js';
import { Notification } from '../models/Notification.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { evaluationWindowError } from '../utils/evaluationWindow.js';

function departmentScope(department) {
  return `DEPARTMENT:${String(department)}`;
}

async function getActiveTemplate(kind, department) {
  if (kind === 'HOD' && department) {
    const scoped = await EvaluationTemplate.findOne({ kind, scopeKey: departmentScope(department), isActive: true })
      .sort({ version: -1 });
    if (scoped) return scoped;
  }
  return EvaluationTemplate.findOne({
    kind,
    isActive: true,
    $or: [{ scopeKey: 'GLOBAL' }, { scopeKey: { $exists: false } }]
  }).sort({ version: -1 });
}

function sameId(first, second) {
  return String(first?._id || first) === String(second?._id || second);
}

async function getSubmissionTemplate(kind, templateId, department) {
  const allowedScopeKeys = kind === 'HOD' && department ? ['GLOBAL', departmentScope(department)] : ['GLOBAL'];
  const template = templateId
    ? await EvaluationTemplate.findOne({
      _id: templateId,
      kind,
      isActive: true,
      $or: [{ scopeKey: { $in: allowedScopeKeys } }, { scopeKey: { $exists: false } }]
    })
    : await getActiveTemplate(kind, department);
  if (!template) {
    const error = new Error('The selected evaluation template is invalid or inactive');
    error.statusCode = 400;
    throw error;
  }
  return template;
}

function canonicalResponses(template, responses) {
  const expected = template.categories.flatMap((category) =>
    category.questions
      .slice()
      .sort((first, second) => first.order - second.order)
      .map((question) => ({ category: category.name, question: question.text, value: question.value || 1 }))
  );
  if (responses.length !== expected.length) {
    const error = new Error('Every template question must be answered');
    error.statusCode = 400;
    throw error;
  }
  const normalized = expected.map((item, index) => {
    const response = responses[index];
    if (response.category !== item.category || response.question !== item.question) {
      const error = new Error('Evaluation questions do not match the active template');
      error.statusCode = 400;
      throw error;
    }
    if (response.notApplicable) {
      if (!template.scale.allowNotApplicable) {
        const error = new Error('Not applicable responses are not allowed by this template');
        error.statusCode = 400;
        throw error;
      }
      return { ...item, notApplicable: true };
    }
    return { ...item, score: response.score, notApplicable: false };
  });
  if (!normalized.some((response) => typeof response.score === 'number')) {
    const error = new Error('At least one question must be scored');
    error.statusCode = 400;
    throw error;
  }
  return normalized;
}

async function loadAssignment(assignmentId) {
  return InstructorAssignment.findById(assignmentId)
    .select('instructor course semester enrolledStudents peerEvaluators status')
    .populate('course', 'department')
    .populate('semester', 'status evaluationOpensAt evaluationClosesAt')
    .lean();
}

export const getEvaluationTemplate = asyncHandler(async (req, res) => {
  const kind = String(req.params.kind || 'STUDENT').toUpperCase();
  if (!['STUDENT', 'PEER', 'HOD'].includes(kind)) return res.status(400).json({ message: 'Invalid evaluation template type' });
  const template = await getActiveTemplate(kind, kind === 'HOD' ? req.user.department : undefined);
  if (!template) return res.status(404).json({ message: 'Evaluation template not found' });
  res.json({ template });
});

export const saveHodEvaluationTemplate = asyncHandler(async (req, res) => {
  if (!req.user.department) return res.status(403).json({ message: 'Your HOD account is not assigned to a department' });
  const scopeKey = departmentScope(req.user.department);
  const latest = await EvaluationTemplate.findOne({ kind: 'HOD', scopeKey }).sort({ version: -1 }).select('version');
  const template = await EvaluationTemplate.create({
    ...req.validated.body,
    kind: 'HOD',
    department: req.user.department,
    scopeKey,
    createdBy: req.user.id,
    version: (latest?.version || 0) + 1,
    isActive: true,
    categories: req.validated.body.categories.map((category) => ({
      name: category.name,
      questions: category.metrics.map((metric, index) => ({ text: metric.name, value: metric.value, order: index + 1 }))
    }))
  });
  await EvaluationTemplate.updateMany(
    { kind: 'HOD', scopeKey, isActive: true, _id: { $ne: template._id } },
    { $set: { isActive: false } }
  );
  res.status(201).json({ template, message: 'Performance criteria and metric values saved' });
});

export const listEvaluationTargets = asyncHandler(async (req, res) => {
  const kind = String(req.params.kind || '').toUpperCase();
  if (kind === 'PEER' && req.user.role !== 'INSTRUCTOR') return res.status(403).json({ message: 'Only instructors can complete peer evaluations' });
  if (kind === 'HOD' && req.user.role !== 'HOD') return res.status(403).json({ message: 'Only HOD users can complete supervisor evaluations' });
  if (!['PEER', 'HOD'].includes(kind)) return res.status(400).json({ message: 'Invalid target type' });

  const filter = { status: 'PUBLISHED' };
  if (!req.user.department) return res.status(403).json({ message: 'Your account is not assigned to a department' });
  const departmentCourses = await Course.distinct('_id', { department: req.user.department });
  filter.course = { $in: departmentCourses };
  if (kind === 'PEER') {
    filter.instructor = { $ne: req.user.id };
    filter.peerEvaluators = req.user.id;
  }
  const candidates = await InstructorAssignment.find(filter)
    .populate('instructor', 'firstName lastName email department')
    .populate('course', 'code title department')
    .populate('semester', 'name academicYear status evaluationOpensAt evaluationClosesAt')
    .sort({ updatedAt: -1 })
    .lean();
  const Model = kind === 'PEER' ? PeerEvaluation : HodEvaluation;
  const submitted = await Model.find({
    evaluator: req.user.id,
    assignment: { $in: candidates.map((candidate) => candidate._id) }
  }).select('assignment').lean();
  const submittedTargets = new Set(submitted.map((item) => String(item.assignment)));
  const targets = candidates.filter((target) => {
    return !evaluationWindowError(target) && !submittedTargets.has(String(target._id));
  });
  res.json({ targets });
});

export const submitStudentEvaluation = asyncHandler(async (req, res) => {
  const { assignment: assignmentId, responses, anonymousComment, template } = req.validated.body;
  const assignment = await loadAssignment(assignmentId);
  if (!assignment) return res.status(404).json({ message: 'Assignment not found' });
  const availabilityError = evaluationWindowError(assignment);
  if (availabilityError) return res.status(409).json({ message: availabilityError });
  if (!assignment.enrolledStudents.some((studentId) => sameId(studentId, req.user.id))) {
    return res.status(403).json({ message: 'You are not enrolled in this assigned course' });
  }
  const existing = await StudentEvaluation.exists({ student: req.user.id, assignment: assignment._id });
  if (existing) return res.status(409).json({ message: 'Evaluation already submitted' });
  const activeTemplate = await getSubmissionTemplate('STUDENT', template, assignment.course.department);
  const validatedResponses = canonicalResponses(activeTemplate, responses);
  const evaluation = await StudentEvaluation.create({
    student: req.user.id,
    instructor: assignment.instructor,
    course: assignment.course._id,
    assignment: assignment._id,
    semester: assignment.semester._id,
    department: assignment.course.department,
    template: activeTemplate._id,
    responses: validatedResponses,
    anonymousComment
  });
  res.status(201).json({ evaluationId: evaluation.id, message: 'Evaluation submitted' });
});

async function submitStaffEvaluation(req, res, kind, Model) {
  const { assignment: assignmentId, template, responses, anonymousComment } = req.validated.body;
  const assignment = await loadAssignment(assignmentId);
  if (!assignment) return res.status(404).json({ message: 'Assignment not found' });
  const availabilityError = evaluationWindowError(assignment);
  if (availabilityError) return res.status(409).json({ message: availabilityError });
  if (sameId(assignment.instructor, req.user.id)) return res.status(403).json({ message: 'You cannot evaluate yourself' });
  if (kind === 'PEER' && !assignment.peerEvaluators.some((evaluator) => sameId(evaluator, req.user.id))) {
    return res.status(403).json({ message: 'This peer evaluation task is not assigned to you' });
  }
  if (!req.user.department || !sameId(req.user.department, assignment.course.department)) {
    return res.status(403).json({ message: 'You can only evaluate instructors in your department' });
  }
  const existing = await Model.exists({ evaluator: req.user.id, assignment: assignment._id });
  if (existing) return res.status(409).json({ message: 'Evaluation already submitted' });
  const activeTemplate = await getSubmissionTemplate(kind, template, assignment.course.department);
  const validatedResponses = canonicalResponses(activeTemplate, responses);
  const evaluation = await Model.create({
    evaluator: req.user.id,
    instructor: assignment.instructor,
    course: assignment.course._id,
    assignment: assignment._id,
    semester: assignment.semester._id,
    department: assignment.course.department,
    template: activeTemplate._id,
    responses: validatedResponses,
    anonymousComment
  });
  return res.status(201).json({ evaluationId: evaluation.id, message: `${kind === 'PEER' ? 'Peer' : 'HOD'} evaluation submitted` });
}

export const submitPeerEvaluation = asyncHandler(async (req, res) => submitStaffEvaluation(req, res, 'PEER', PeerEvaluation));

export const submitHodEvaluation = asyncHandler(async (req, res) => submitStaffEvaluation(req, res, 'HOD', HodEvaluation));

export const studentEvaluationStatus = asyncHandler(async (req, res) => {
  const assignments = await InstructorAssignment.find({ enrolledStudents: req.user.id, status: 'PUBLISHED' })
    .select('course semester instructor status')
    .populate('course', 'code title')
    .populate('semester', 'status evaluationOpensAt evaluationClosesAt')
    .populate('instructor', 'firstName lastName')
    .lean();
  const [submitted, notifications] = await Promise.all([
    StudentEvaluation.find({ student: req.user.id, assignment: { $in: assignments.map((assignment) => assignment._id) } }).select('assignment').lean(),
    Notification.find({
      $or: [
        { user: req.user.id },
        { audience: 'DEPARTMENT', department: req.user.department },
        { audience: 'UNIVERSITY' }
      ]
    })
      .sort({ createdAt: -1 })
      .limit(30)
      .populate('sender', 'firstName lastName role')
      .lean()
  ]);
  const submittedIds = new Set(submitted.map((item) => item.assignment.toString()));
  res.json({
    courses: assignments
      .filter((assignment) => !evaluationWindowError(assignment))
      .map((assignment) => ({ assignmentId: String(assignment._id), course: assignment.course, instructor: assignment.instructor, submitted: submittedIds.has(String(assignment._id)) })),
    notifications
  });
});
