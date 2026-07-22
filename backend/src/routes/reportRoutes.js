import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { publishReportSchema, reportParamsSchema } from '../validators/schemas.js';
import { downloadInstructorExcel, downloadInstructorPdf, getDepartmentReport, getInstructorReport, publishInstructorReport } from '../controllers/reportController.js';

export const reportRoutes = Router();
reportRoutes.use(authenticate);
reportRoutes.get('/reports/instructor/:instructorId', authorize('SUPER_ADMIN', 'HOD', 'COURSE_COMMITTEE', 'EXAM_COMMITTEE', 'INSTRUCTOR'), validate(reportParamsSchema), getInstructorReport);
reportRoutes.get('/reports/instructor/:instructorId/pdf', authorize('SUPER_ADMIN', 'HOD', 'COURSE_COMMITTEE', 'EXAM_COMMITTEE', 'INSTRUCTOR'), validate(reportParamsSchema), downloadInstructorPdf);
reportRoutes.get('/reports/instructor/:instructorId/excel', authorize('SUPER_ADMIN', 'HOD', 'COURSE_COMMITTEE', 'EXAM_COMMITTEE', 'INSTRUCTOR'), validate(reportParamsSchema), downloadInstructorExcel);
reportRoutes.post('/reports/instructor/:instructorId/publish', authorize('HOD', 'COURSE_COMMITTEE', 'EXAM_COMMITTEE'), validate(publishReportSchema), publishInstructorReport);
reportRoutes.get('/reports/department/:departmentId', authorize('SUPER_ADMIN', 'HOD'), getDepartmentReport);

