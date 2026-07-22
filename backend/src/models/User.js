import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { ACADEMIC_STREAMS } from '../constants/academicStreams.js';
import { isMtuEmail, MTU_EMAIL_MESSAGE, normalizeMtuEmail } from '../utils/email.js';

export const ROLES = ['SUPER_ADMIN', 'HOD', 'EXAM_COMMITTEE', 'INSTRUCTOR', 'STUDENT'];
export const COMMITTEE_ROLES = ['COURSE_COMMITTEE', 'EXAM_COMMITTEE'];

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
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
    isEmailVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    tokenVersion: { type: Number, default: 0 },
    resetPasswordTokenHash: String,
    resetPasswordExpiresAt: Date
  },
  { timestamps: true }
);

userSchema.virtual('name').get(function getName() {
  return `${this.firstName} ${this.lastName}`;
});

userSchema.methods.comparePassword = function comparePassword(password) {
  return bcrypt.compare(password, this.passwordHash);
};

userSchema.statics.hashPassword = function hashPassword(password) {
  return bcrypt.hash(password, 12);
};

export const User = mongoose.model('User', userSchema);
