import { Router } from 'express';
import multer from 'multer';
import { authenticate, authorize } from '../middleware/auth.js';
import { audit } from '../middleware/audit.js';
import { validate } from '../middleware/validate.js';
import { createSchedule, downloadSchedule, listSchedules, updateSchedule } from '../controllers/scheduleController.js';
import { scheduleSchema } from '../validators/schemas.js';

function scheduleFileFilter(req, file, callback) {
  const fileName = String(file.originalname || '').toLowerCase();
  const validPdf = file.mimetype === 'application/pdf' && fileName.endsWith('.pdf');
  const validCsv = ['text/csv', 'application/csv', 'application/vnd.ms-excel', 'text/plain'].includes(file.mimetype) && fileName.endsWith('.csv');
  if (validPdf || validCsv) return callback(null, true);
  const error = new Error('Schedule attachments must be PDF or CSV files');
  error.statusCode = 400;
  return callback(error);
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 }, fileFilter: scheduleFileFilter });
const managers = ['SUPER_ADMIN', 'HOD', 'COURSE_COMMITTEE', 'EXAM_COMMITTEE'];

export const scheduleRoutes = Router();
scheduleRoutes.use(authenticate);
scheduleRoutes.get('/schedules', listSchedules);
scheduleRoutes.get('/schedules/:id/file', downloadSchedule);
scheduleRoutes.post('/schedules', authorize(...managers), upload.single('file'), validate(scheduleSchema), audit('SCHEDULE_CREATED'), createSchedule);
scheduleRoutes.put('/schedules/:id', authorize(...managers), upload.single('file'), validate(scheduleSchema), audit('SCHEDULE_UPDATED'), updateSchedule);
