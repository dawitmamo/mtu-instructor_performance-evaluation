import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { audit } from '../middleware/audit.js';
import { validate } from '../middleware/validate.js';
import { authSchemas } from '../validators/schemas.js';
import { changePassword, forgotPassword, login, me, refresh, register } from '../controllers/authController.js';

export const authRoutes = Router();
authRoutes.post('/register', authenticate, authorize('SUPER_ADMIN', 'HOD', 'COURSE_COMMITTEE', 'EXAM_COMMITTEE'), validate(authSchemas.register), audit('USER_REGISTERED'), register);
authRoutes.post('/login', validate(authSchemas.login), login);
authRoutes.post('/refresh', validate(authSchemas.refresh), refresh);
authRoutes.post('/forgot-password', validate(authSchemas.forgotPassword), forgotPassword);
authRoutes.post('/change-password', authenticate, validate(authSchemas.changePassword), audit('PASSWORD_CHANGED'), changePassword);
authRoutes.get('/me', authenticate, me);
