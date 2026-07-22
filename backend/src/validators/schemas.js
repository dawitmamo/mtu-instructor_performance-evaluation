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
const managedUserFields = { firstName: z.string().min(2), lastName: z.string().min(2), email: mtuEmail, role: z.enum(['SUPER_ADMIN', 'HOD', 'EXAM_COMMITTEE', 'INSTRUCTOR', 'STUDENT']), committeeRoles: z.array(z.enum(['COURSE_COMMITTEE', 'EXAM_COMMITTEE'])).max(2).optional().default([]), department: optionalObjectId, studentNumber: z.string().optional(), yearLevel: optionalYearLevel, gpa: optionalGpa, academicStream: optionalAcademicStream, employeeNumber: z.string().optional() };
const requireUserDepartment = (schema) => schema.superRefine((value, context) => {
  if (value.role !== 'SUPER_ADMIN' && !value.department) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Department is required for this role', path: ['department'] });
  }
  if (value.role === 'STUDENT' && !String(value.studentNumber || '').trim()) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Student number is required for student accounts', path: ['studentNumber'] });
  }
});

export const authSchemas = {
  register: z.object({ body: requireUserDepartment(z.object({ ...managedUserFields, password: z.string().min(8) })) }),
  login: z.object({ body: z.object({ email: mtuEmail, password: z.string().min(1) }) }),
  refresh: z.object({ body: z.object({ refreshToken: z.string().min(20) }) }),
  forgotPassword: z.object({ body: z.object({ email: mtuEmail }) }),
  changePassword: z.object({ body: z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8) }) })
};

export const userUpdateSchema = z.object({ body: requireUserDepartment(z.object({ ...managedUserFields, password: z.string().min(8).optional().or(z.literal('')).transform((value) => value || undefined), isActive: z.boolean().optional() })) });
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
  enrolledStudents: z.array(objectId).default([]).refine((items) => new Set(items).size === items.length, 'A student can only appear once in an assignment'),
  peerEvaluators: z.array(objectId).default([]).refine((items) => new Set(items).size === items.length, 'A peer evaluator can only appear once in an assignment'),
  status: z.enum(['DRAFT', 'VERIFIED', 'PUBLISHED']).optional()
}) });
export const examCommitteeSchema = z.object({ body: z.object({
  semester: objectId,
  members: z.array(objectId).length(3, 'Select exactly three instructors').refine((members) => new Set(members).size === 3, 'Select three different instructors'),
  chair: objectId
}).refine((value) => value.members.includes(value.chair), { message: 'The chair must be one of the three selected instructors', path: ['chair'] }) });
export const keyGenerationSchema = z.object({ body: z.object({ assignment: objectId, expiresAt: z.coerce.date() }) });
export const studentEvaluationSchema = z.object({ body: z.object({ assignment: objectId, evaluationKey: z.string().min(8), template: objectId.optional(), responses: z.array(response).min(1), anonymousComment: z.string().max(2000).optional() }) });
export const peerEvaluationSchema = z.object({ body: z.object({ assignment: objectId, template: objectId.optional(), responses: z.array(response).min(1), anonymousComment: z.string().max(2000).optional() }) });
export const hodEvaluationSchema = peerEvaluationSchema;
export const reportParamsSchema = z.object({ params: z.object({ instructorId: objectId }), query: z.object({ semester: objectId.optional() }) });
export const publishReportSchema = z.object({ params: z.object({ instructorId: objectId }), query: z.object({ semester: objectId.optional() }), body: z.object({ finalSummary: z.string().trim().min(10).max(4000) }) });
export const notificationSchema = z.object({ body: z.object({ title: z.string().trim().min(3).max(150), message: z.string().trim().min(5).max(2000), type: z.enum(['INFO', 'REMINDER', 'DEADLINE']).optional(), audience: z.enum(['USER', 'DEPARTMENT', 'UNIVERSITY']), user: objectId.optional(), department: objectId.optional() }).superRefine((value, context) => {
  if (value.audience === 'USER' && !value.user) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Staff recipient is required', path: ['user'] });
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
