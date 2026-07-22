import crypto from 'node:crypto';
import { User } from '../models/User.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/tokens.js';
import { validateUserAcademicProfile } from '../utils/academicProfile.js';

function publicUser(user) {
  return { id: user.id, name: user.name, firstName: user.firstName, lastName: user.lastName, email: user.email, role: user.role, committeeRoles: user.committeeRoles || [], department: user.department, studentNumber: user.studentNumber, yearLevel: user.yearLevel, gpa: user.gpa, academicStream: user.academicStream };
}

function authPayload(user) {
  return {
    user: publicUser(user),
    accessToken: signAccessToken(user),
    refreshToken: signRefreshToken(user)
  };
}

function sameId(first, second) {
  return String(first?._id || first) === String(second?._id || second);
}

export const register = asyncHandler(async (req, res) => {
  const { password, ...body } = req.validated.body;
  const requesterIsCommittee = req.user.role === 'EXAM_COMMITTEE' || (req.user.committeeRoles || []).length > 0;
  if (body.committeeRoles.length && body.role !== 'INSTRUCTOR') {
    return res.status(400).json({ message: 'Committee duties can only be assigned to instructor accounts' });
  }
  if (body.committeeRoles.includes('EXAM_COMMITTEE')) {
    return res.status(400).json({ message: 'Assign Exam Committee members from the semester Exam Committee page' });
  }
  await validateUserAcademicProfile(body);
  if (req.user.role === 'HOD' && body.role === 'SUPER_ADMIN') return res.status(403).json({ message: 'HOD users cannot create Super Admin accounts' });
  if (req.user.role === 'HOD' && (!req.user.department || !body.department || !sameId(req.user.department, body.department))) {
    return res.status(403).json({ message: 'HOD users can only create accounts in their department' });
  }
  if (requesterIsCommittee) {
    if (!['INSTRUCTOR', 'STUDENT'].includes(body.role)) return res.status(403).json({ message: 'Committee members can only create instructor or student accounts' });
    if (!req.user.department || !body.department || !sameId(req.user.department, body.department)) {
      return res.status(403).json({ message: 'Committee members can only create accounts in their department' });
    }
    body.committeeRoles = [];
  }
  const existing = await User.findOne({ email: body.email });
  if (existing) return res.status(409).json({ message: 'Email already registered' });
  const user = await User.create({ ...body, passwordHash: await User.hashPassword(password) });
  return res.status(201).json(authPayload(user));
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.validated.body;
  const user = await User.findOne({ email }).select('+passwordHash');
  if (!user || !(await user.comparePassword(password))) return res.status(401).json({ message: 'Invalid email or password' });
  if (!user.isActive) return res.status(403).json({ message: 'Account disabled' });
  return res.json(authPayload(user));
});

export const refresh = asyncHandler(async (req, res) => {
  let payload;
  try {
    payload = verifyRefreshToken(req.validated.body.refreshToken);
  } catch {
    return res.status(401).json({ message: 'Invalid or expired refresh token' });
  }
  const user = await User.findById(payload.sub);
  if (!user || !user.isActive || user.tokenVersion !== payload.tokenVersion) return res.status(401).json({ message: 'Invalid refresh token' });
  return res.json(authPayload(user));
});

export const me = asyncHandler(async (req, res) => res.json({ user: publicUser(req.user) }));

export const forgotPassword = asyncHandler(async (req, res) => {
  const user = await User.findOne({ email: req.validated.body.email });
  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    user.resetPasswordTokenHash = crypto.createHash('sha256').update(token).digest('hex');
    user.resetPasswordExpiresAt = new Date(Date.now() + 1000 * 60 * 30);
    await user.save();
  }
  return res.json({ message: 'If the account exists, a reset link will be sent.' });
});

export const changePassword = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).select('+passwordHash');
  const { currentPassword, newPassword } = req.validated.body;
  if (!(await user.comparePassword(currentPassword))) return res.status(400).json({ message: 'Current password is incorrect' });
  user.passwordHash = await User.hashPassword(newPassword);
  user.tokenVersion += 1;
  await user.save();
  return res.json({ message: 'Password changed successfully' });
});
