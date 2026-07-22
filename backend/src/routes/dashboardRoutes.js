import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { notificationSchema } from '../validators/schemas.js';
import { createNotification, dashboardSummary, instructorDashboard } from '../controllers/dashboardController.js';

export const dashboardRoutes = Router();
dashboardRoutes.use(authenticate);
dashboardRoutes.get('/dashboard/summary', authorize('SUPER_ADMIN', 'HOD', 'COURSE_COMMITTEE', 'EXAM_COMMITTEE'), dashboardSummary);
dashboardRoutes.get('/dashboard/instructor', authorize('INSTRUCTOR'), instructorDashboard);
dashboardRoutes.get('/dashboard/instructor/:instructorId', authorize('SUPER_ADMIN', 'HOD'), instructorDashboard);
dashboardRoutes.post('/notifications', authorize('SUPER_ADMIN', 'HOD', 'COURSE_COMMITTEE', 'EXAM_COMMITTEE'), validate(notificationSchema), createNotification);
