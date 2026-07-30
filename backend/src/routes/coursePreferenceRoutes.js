import { Router } from 'express';
import { finalizeCoursePreference, getCoursePreferenceManagement, getInstructorCoursePreferences, recommendCoursePreference, resetCourseAllocations, submitCoursePreference } from '../controllers/coursePreferenceController.js';
import { audit } from '../middleware/audit.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { coursePreferenceDecisionSchema, coursePreferenceResetSchema, coursePreferenceSchema } from '../validators/schemas.js';

export const coursePreferenceRoutes = Router();
coursePreferenceRoutes.use(authenticate);
coursePreferenceRoutes.get('/course-preferences/instructor', authorize('INSTRUCTOR'), getInstructorCoursePreferences);
coursePreferenceRoutes.post('/course-preferences', authorize('INSTRUCTOR'), validate(coursePreferenceSchema), audit('COURSE_PREFERENCES_SUBMITTED'), submitCoursePreference);
coursePreferenceRoutes.get('/course-preferences/manage', authorize('HOD', 'COURSE_EXAM_COMMITTEE'), getCoursePreferenceManagement);
coursePreferenceRoutes.post('/course-preferences/:id/recommend', authorize('COURSE_EXAM_COMMITTEE'), validate(coursePreferenceDecisionSchema), audit('COURSE_PREFERENCE_RECOMMENDED'), recommendCoursePreference);
coursePreferenceRoutes.post('/course-preferences/:id/finalize', authorize('HOD'), validate(coursePreferenceDecisionSchema), audit('COURSE_PREFERENCE_FINALIZED'), finalizeCoursePreference);
coursePreferenceRoutes.post('/course-preferences/reset', authorize('HOD'), validate(coursePreferenceResetSchema), audit('COURSE_ALLOCATIONS_RESET'), resetCourseAllocations);
