import { z } from 'zod';
import { ACADEMIC_STREAMS } from '../constants/academicStreams.js';
import { isMtuEmail, MTU_EMAIL_MESSAGE } from '../utils/email.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const optionalObjectId = z.union([objectId, z.literal('')]).optional().transform((value) => value || undefined);
const optionalYearLevel = z.union([z.coerce.number().int().min(2).max(5), z.literal('')]).optional().transform((value) => value === '' ? undefined : value);
const optionalAcademicStream = z.union([z.enum(ACADEMIC_STREAMS), z.literal('')]).optional().transform((value) => value || undefined);
const optionalGpa = z.preprocess(
  (value) => value === '' || value === null ? undefined : value,
  z.coerce.number().min(0).max(4).optional()
);
const response = z
  .object({
    category: z.string().min(2),
    question: z.string().min(2),
    score: z.number().int().min(1).max(5).optional(),
    notApplicable: z.boolean().optional().default(false)
  })
  .refine((value) => value.notApplicable || typeof value.score === 'number', { message: 'Score is required unless marked not applicable', path: ['score'] });

const mtuEmail = z.string().trim().toLowerCase().email().refine(isMtuEmail, MTU_EMAIL_MESSAGE);
const username = z.string().trim().toLowerCase().min(3).max(50).regex(/^[a-z0-9._-]+$/, 'Username may contain lowercase letters, numbers, dots, underscores, and hyphens');
const managedUserFields = { firstName: z.string().min(2), lastName: z.string().min(2), username: username.optional(), email: mtuEmail, role: z.enum(['SUPER_ADMIN', 'HOD', 'INSTRUCTOR', 'STUDENT']), committeeRoles: z.array(z.literal('COURSE_EXAM_COMMITTEE')).max(1).optional().default([]), department: optionalObjectId, studentNumber: z.string().optional(), yearLevel: optionalYearLevel, gpa: optionalGpa, academicStream: optionalAcademicStream, employeeNumber: z.string().optional() };
const requireUserDepartment = (schema) => schema.superRefine((value, context) => {
  if (value.role !== 'SUPER_ADMIN' && !value.department) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Department is required for this role', path: ['department'] });
  }
  if (value.role === 'STUDENT' && !String(value.studentNumber || '').trim()) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Student number is required for student accounts', path: ['studentNumber'] });
  }
});

const selfRegistration = z.object({
  firstName: z.string().trim().min(2).max(50),
  lastName: z.string().trim().min(2).max(50),
  email: mtuEmail,
  role: z.enum(['INSTRUCTOR', 'STUDENT']),
  department: objectId,
  studentNumber: z.string().trim().max(50).optional(),
  yearLevel: optionalYearLevel,
  academicStream: optionalAcademicStream,
  employeeNumber: z.string().trim().max(50).optional()
}).strict().superRefine((value, context) => {
  if (value.role === 'STUDENT' && !value.studentNumber) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Student number is required', path: ['studentNumber'] });
  }
  if (value.role === 'STUDENT' && !value.yearLevel) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Grade/year level is required', path: ['yearLevel'] });
  }
});

export const authSchemas = {
  register: z.object({ body: requireUserDepartment(z.object(managedUserFields).strict()) }),
  signup: z.object({ body: selfRegistration }),
  login: z.object({ body: z.object({
    username: z.string().trim().toLowerCase().min(1).max(100).optional(),
    email: mtuEmail.optional(),
    password: z.string().min(1),
    userType: z.enum(['SUPER_ADMIN', 'HOD', 'INSTRUCTOR', 'STUDENT', 'COURSE_EXAM_COMMITTEE']).optional(),
    department: optionalObjectId
  }).refine((value) => value.username || value.email, { message: 'Username is required', path: ['username'] }) }),
  refresh: z.object({ body: z.object({ refreshToken: z.string().min(20) }) }),
  forgotPassword: z.object({ body: z.object({ email: mtuEmail }) }),
  resetPassword: z.object({ body: z.object({ token: z.string().trim().min(32), newPassword: z.string().min(8) }) }),
  changePassword: z.object({ body: z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8) }) }),
  profile: z.object({ body: z.object({
    firstName: z.string().trim().min(2).max(50),
    lastName: z.string().trim().min(2).max(50),
    phone: z.string().trim().max(30).optional().default(''),
    bio: z.string().trim().max(500).optional().default('')
  }) })
};

export const userUpdateSchema = z.object({ body: requireUserDepartment(z.object({ ...managedUserFields, isActive: z.boolean().optional() }).strict()) });
export const registrationReviewSchema = z.object({ body: z.object({ status: z.enum(['APPROVED', 'REJECTED']) }) });
export const departmentSchema = z.object({ body: z.object({ name: z.string().min(2), code: z.string().min(2), faculty: z.string().min(2), hod: optionalObjectId }) });
export const semesterSchema = z.object({ body: z.object({ name: z.string().min(2), academicYear: z.string().min(4), startsAt: z.coerce.date(), endsAt: z.coerce.date(), evaluationOpensAt: z.coerce.date().optional(), evaluationClosesAt: z.coerce.date().optional(), status: z.enum(['DRAFT', 'SCHEDULED', 'OPEN', 'CLOSED', 'ARCHIVED']).optional() }).superRefine((value, context) => {
  if (value.endsAt <= value.startsAt) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Semester end date must be after its start date', path: ['endsAt'] });
  if (value.evaluationOpensAt && value.evaluationClosesAt && value.evaluationClosesAt <= value.evaluationOpensAt) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Evaluation closing date must be after its opening date', path: ['evaluationClosesAt'] });
  }
}) });
export const courseSchema = z.object({ body: z.object({ code: z.string().min(2), title: z.string().min(2), creditHours: z.number().int().min(1).max(8).optional(), department: objectId, semester: objectId, level: z.string().optional(), yearLevel: optionalYearLevel, academicStream: optionalAcademicStream }) });
export const assignmentSchema = z.object({ body: z.object({
  instructor: objectId,
  course: objectId,
  semester: objectId,
  enrollmentMode: z.enum(['COHORT', 'INDIVIDUAL']).optional().default('INDIVIDUAL'),
  studentCohort: z.object({ yearLevel: z.coerce.number().int().min(2).max(5), academicStream: optionalAcademicStream }).optional(),
  enrolledStudents: z.array(objectId).default([]).refine((items) => new Set(items).size === items.length, 'A student can only appear once in an assignment'),
  peerEvaluators: z.array(objectId).default([]).refine((items) => new Set(items).size === items.length, 'A peer evaluator can only appear once in an assignment'),
  status: z.enum(['DRAFT', 'VERIFIED', 'PUBLISHED']).optional()
}).superRefine((value, context) => {
  if (value.enrollmentMode === 'COHORT' && !value.studentCohort) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Select a student class/cohort', path: ['studentCohort'] });
  }
}) });
export const examCommitteeSchema = z.object({ body: z.object({
  department: objectId.optional(),
  semester: objectId,
  members: z.array(objectId).length(3, 'Select exactly three instructors').refine((members) => new Set(members).size === 3, 'Select three different instructors'),
  chair: objectId
}).refine((value) => value.members.includes(value.chair), { message: 'The chair must be one of the three selected instructors', path: ['chair'] }) });
export const studentEvaluationSchema = z.object({ body: z.object({ assignment: objectId, template: objectId.optional(), responses: z.array(response).min(1), anonymousComment: z.string().max(2000).optional() }) });
export const peerEvaluationSchema = z.object({ body: z.object({ assignment: objectId, template: objectId.optional(), responses: z.array(response).min(1), anonymousComment: z.string().max(2000).optional() }) });
export const hodEvaluationSchema = peerEvaluationSchema;
const performanceMetric = z.object({
  name: z.string().trim().min(2).max(300),
  value: z.coerce.number().int().min(1).max(100)
});
const performanceCriterion = z.object({
  name: z.string().trim().min(2).max(100),
  metrics: z.array(performanceMetric).min(1).max(50)
    .refine((metrics) => new Set(metrics.map((metric) => metric.name.toLowerCase())).size === metrics.length, 'Metric names must be unique within a criterion')
});
export const hodEvaluationTemplateSchema = z.object({
  body: z.object({
    name: z.string().trim().min(3).max(150),
    description: z.string().trim().max(1000).optional().default(''),
    categories: z.array(performanceCriterion).min(1).max(20)
      .refine((categories) => new Set(categories.map((category) => category.name.toLowerCase())).size === categories.length, 'Criterion names must be unique')
      .refine((categories) => categories.reduce((total, category) => total + category.metrics.length, 0) <= 200, 'A template can contain at most 200 metrics')
  })
});
export const reportParamsSchema = z.object({ params: z.object({ instructorId: objectId }), query: z.object({ semester: objectId.optional(), assignment: objectId.optional() }) });
export const publishReportSchema = z.object({ params: z.object({ instructorId: objectId }), query: z.object({ semester: objectId.optional(), assignment: objectId.optional() }), body: z.object({ finalSummary: z.string().trim().min(10).max(4000) }) });
export const notificationSchema = z.object({ body: z.object({ title: z.string().trim().min(3).max(150), message: z.string().trim().min(5).max(2000), type: z.enum(['INFO', 'REMINDER', 'DEADLINE']).optional(), audience: z.enum(['USER', 'DEPARTMENT', 'UNIVERSITY']), user: objectId.optional(), department: objectId.optional() }).superRefine((value, context) => {
  if (value.audience === 'USER' && !value.user) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Recipient is required', path: ['user'] });
}) });

export const scheduleSchema = z.object({ body: z.object({
  title: z.string().trim().min(3).max(150),
  description: z.string().trim().max(5000).optional().default(''),
  scheduleType: z.enum(['CLASS', 'EXAM', 'COMBINED']),
  department: optionalObjectId,
  semester: objectId,
  status: z.enum(['DRAFT', 'PUBLISHED']).optional().default('PUBLISHED')
}) });

const streamCapacities = z.array(z.object({ academicStream: z.enum(ACADEMIC_STREAMS), seats: z.coerce.number().int().min(0) }))
  .length(ACADEMIC_STREAMS.length)
  .refine((items) => new Set(items.map((item) => item.academicStream)).size === ACADEMIC_STREAMS.length, 'Provide one capacity for each stream');

export const streamSelectionRoundSchema = z.object({ body: z.object({
  semester: objectId,
  status: z.enum(['DRAFT', 'OPEN', 'CLOSED']).optional(),
  capacities: streamCapacities
}) });

export const streamPreferenceSchema = z.object({ body: z.object({
  round: objectId,
  choices: z.array(z.enum(ACADEMIC_STREAMS)).length(3).refine((items) => new Set(items).size === 3, 'Select three different streams')
}) });

export const coursePreferenceSchema = z.object({ body: z.object({
  semester: objectId,
  choices: z.array(objectId).min(1, 'Select at least one course').max(3, 'Select no more than three courses')
    .refine((items) => new Set(items).size === items.length, 'Select different courses')
}) });

export const coursePreferenceDecisionSchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object({ course: objectId, note: z.string().trim().min(5, 'State the criteria used for this decision').max(1000) })
});

export const coursePreferenceResetSchema = z.object({ body: z.object({ semester: objectId }) });
