import multer from 'multer';
import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { audit } from '../middleware/audit.js';
import { uploadStudents, uploadUsers } from '../controllers/uploadController.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
export const uploadRoutes = Router();
uploadRoutes.post('/uploads/students', authenticate, authorize('SUPER_ADMIN', 'HOD', 'COURSE_COMMITTEE', 'EXAM_COMMITTEE'), upload.single('file'), audit('STUDENT_CSV_UPLOADED'), uploadStudents);
uploadRoutes.post('/uploads/users', authenticate, authorize('SUPER_ADMIN', 'HOD', 'COURSE_COMMITTEE', 'EXAM_COMMITTEE'), upload.single('file'), audit('USER_FILE_IMPORTED'), uploadUsers);
