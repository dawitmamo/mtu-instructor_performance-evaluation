import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { ACADEMIC_STREAMS } from '../constants/academicStreams.js';
import { isMtuEmail, MTU_EMAIL_MESSAGE, normalizeMtuEmail } from '../utils/email.js';

export const ROLES = ['SUPER_ADMIN', 'HOD', 'INSTRUCTOR', 'STUDENT'];
export const COMMITTEE_ROLES = ['COURSE_EXAM_COMMITTEE'];

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    username: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
      minlength: 3,
      maxlength: 50,
      match: /^[a-z0-9._-]+$/
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      set: normalizeMtuEmail,
      validate: { validator: isMtuEmail, message: MTU_EMAIL_MESSAGE }
    },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, required: true, index: true },
    committeeRoles: [{ type: String, enum: COMMITTEE_ROLES }],
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
    studentNumber: { type: String, trim: true },
    yearLevel: { type: Number, min: 2, max: 5 },
    gpa: { type: Number, min: 0, max: 4 },
    academicStream: { type: String, enum: ACADEMIC_STREAMS },
    employeeNumber: { type: String, trim: true },
    phone: { type: String, trim: true, maxlength: 30 },
    bio: { type: String, trim: true, maxlength: 500 },
    registrationStatus: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED'],
      default: 'APPROVED',
      index: true
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date,
    profilePhoto: {
      data: { type: Buffer, select: false },
      contentType: { type: String, enum: ['image/jpeg', 'image/png', 'image/webp'] },
      fileName: { type: String, trim: true, maxlength: 180 },
      updatedAt: Date
    },
    isActive: { type: Boolean, default: true },
    requiresPasswordSetup: { type: Boolean, default: false },
    setupEmailSentAt: Date,
    welcomeEmailPending: { type: Boolean, default: false },
    passwordSetupCompletedAt: Date,
    tokenVersion: { type: Number, default: 0 },
    resetPasswordTokenHash: { type: String, select: false },
    resetPasswordExpiresAt: { type: Date, select: false }
  },
  { timestamps: true }
);

userSchema.virtual('name').get(function getName() {
  return `${this.firstName} ${this.lastName}`;
});

userSchema.index(
  { department: 1, role: 1, isActive: 1, registrationStatus: 1 },
  { name: 'user_department_recipient_lookup' }
);

userSchema.methods.comparePassword = function comparePassword(password) {
  return bcrypt.compare(password, this.passwordHash);
};

userSchema.statics.hashPassword = function hashPassword(password) {
  return bcrypt.hash(password, 12);
};

export const User = mongoose.model('User', userSchema);
