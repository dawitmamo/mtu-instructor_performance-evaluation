import { Router } from 'express';
import multer from 'multer';
import { authenticate, authorize } from '../middleware/auth.js';
import { audit } from '../middleware/audit.js';
import { validate } from '../middleware/validate.js';
import { authSchemas } from '../validators/schemas.js';
import { changePassword, deleteProfilePhoto, forgotPassword, getProfilePhoto, listLoginDepartments, login, me, refresh, register, resetPassword, updateProfile, uploadProfilePhoto } from '../controllers/authController.js';


function profilePhotoFilter(req, file, callback) {
  const fileName = String(file.originalname || '').toLowerCase();
  const validTypes = {
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/png': ['.png'],
    'image/webp': ['.webp']
  };
  const valid = validTypes[file.mimetype]?.some((extension) => fileName.endsWith(extension));
  if (valid) return callback(null, true);
  const error = new Error('Profile photo must be a JPEG, PNG, or WebP image');
  error.statusCode = 400;
  return callback(error);
}

const profilePhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: profilePhotoFilter
});
export const authRoutes = Router();
authRoutes.get('/departments', listLoginDepartments);
authRoutes.post('/register', authenticate, authorize('SUPER_ADMIN', 'HOD'), validate(authSchemas.register), audit('USER_REGISTERED'), register);
authRoutes.post('/login', validate(authSchemas.login), login);
authRoutes.post('/refresh', validate(authSchemas.refresh), refresh);
authRoutes.post('/forgot-password', validate(authSchemas.forgotPassword), forgotPassword);
authRoutes.post('/reset-password', validate(authSchemas.resetPassword), audit('PASSWORD_RESET'), resetPassword);
authRoutes.post('/change-password', authenticate, validate(authSchemas.changePassword), audit('PASSWORD_CHANGED'), changePassword);
authRoutes.get('/me', authenticate, me);
authRoutes.put('/profile', authenticate, validate(authSchemas.profile), audit('PROFILE_UPDATED'), updateProfile);
authRoutes.post('/profile/photo', authenticate, profilePhotoUpload.single('photo'), audit('PROFILE_PHOTO_UPDATED'), uploadProfilePhoto);
authRoutes.delete('/profile/photo', authenticate, audit('PROFILE_PHOTO_REMOVED'), deleteProfilePhoto);
authRoutes.get('/profile/photo/:userId', authenticate, getProfilePhoto);
