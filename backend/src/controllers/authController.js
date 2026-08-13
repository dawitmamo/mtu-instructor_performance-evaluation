import crypto from 'node:crypto';
import { User } from '../models/User.js';
import { Department } from '../models/Department.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/tokens.js';
import { validateUserAcademicProfile } from '../utils/academicProfile.js';
import { syncUserCommitteeMembership } from '../services/committeeMembership.js';
import { sendPasswordResetEmail } from '../services/notificationEmail.js';

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    firstName: user.firstName,
    lastName: user.lastName,
    username: user.username,
    email: user.email,
    role: user.role,
    committeeRoles: user.committeeRoles || [],
    department: user.department,
    studentNumber: user.studentNumber,
    employeeNumber: user.employeeNumber,
    yearLevel: user.yearLevel,
    gpa: user.gpa,
    academicStream: user.academicStream,
    phone: user.phone || '',
    bio: user.bio || '',
    registrationStatus: user.registrationStatus || 'APPROVED',
    reviewedBy: user.reviewedBy,
    reviewedAt: user.reviewedAt,
    hasProfilePhoto: Boolean(user.profilePhoto?.contentType),
    profilePhotoUpdatedAt: user.profilePhoto?.updatedAt
  };
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

async function createUser(body, password, registration = {}) {
  body.username ||= body.email.split('@')[0];
  const existing = await User.findOne({ $or: [
    { email: body.email },
    { username: body.username },
    { email: `${body.username}@mtu.edu.et` }
  ] });
  if (existing) {
    const error = new Error(existing.email === body.email ? 'Email already registered' : 'Username already registered');
    error.statusCode = 409;
    throw error;
  }
  const user = await User.create({
    ...body,
    ...registration,
    passwordHash: await User.hashPassword(password)
  });
  return user;
}

export const register = asyncHandler(async (req, res) => {
  const { password, ...body } = req.validated.body;
  if (body.committeeRoles.length && body.role !== 'INSTRUCTOR') {
    return res.status(400).json({ message: 'Committee duties can only be assigned to instructor accounts' });
  }
  if (body.committeeRoles.includes('COURSE_EXAM_COMMITTEE')) {
    return res.status(400).json({ message: 'Assign Course and Exam Committee members from the semester committee page' });
  }
  await validateUserAcademicProfile(body);
  if (req.user.role === 'HOD' && !['INSTRUCTOR', 'STUDENT'].includes(body.role)) return res.status(403).json({ message: 'HOD users can only create instructor or student accounts' });
  if (req.user.role === 'HOD' && (!req.user.department || !body.department || !sameId(req.user.department, body.department))) {
    return res.status(403).json({ message: 'HOD users can only create accounts in their department' });
  }
  const user = await createUser(body, password, {
    registrationStatus: 'APPROVED',
    reviewedBy: req.user.id,
    reviewedAt: new Date()
  });
  return res.status(201).json({ user: publicUser(user), message: 'Account created. The user can sign in with the assigned username and password.' });
});

export const signup = asyncHandler(async (req, res) => {
  const { password, ...body } = req.validated.body;
  await validateUserAcademicProfile(body);
  const user = await createUser({ ...body, committeeRoles: [] }, password, {
    registrationStatus: 'PENDING',
    isActive: false
  });
  return res.status(201).json({
    user: publicUser(user),
    message: 'Registration submitted. Your HOD or a Super Admin must verify the account before you can sign in.'
  });
});

export const listLoginDepartments = asyncHandler(async (req, res) => {
  const departments = await Department.find().select('name code').sort({ name: 1 });
  res.json({ departments });
});

export const login = asyncHandler(async (req, res) => {
  const { password, userType, department } = req.validated.body;
  const username = req.validated.body.username || req.validated.body.email;
  let user = await User.findOne({ username }).select('+passwordHash');
  // Existing installations used the MTU email as the identifier. This fallback lets
  // those accounts use the part before @mtu.edu.et until an administrator saves a username.
  if (!user) {
    const legacyEmail = username.includes('@') ? username : `${username}@mtu.edu.et`;
    user = await User.findOne({ email: legacyEmail }).select('+passwordHash');
  }
  if (!user || !(await user.comparePassword(password))) return res.status(401).json({ message: 'Invalid email, username, or password' });
  if (user.registrationStatus === 'PENDING') return res.status(403).json({ message: 'Your registration is pending verification by your HOD or Super Admin.' });
  if (user.registrationStatus === 'REJECTED') return res.status(403).json({ message: 'Your registration was not approved. Contact your HOD or Super Admin.' });
  if (!user.isActive) return res.status(403).json({ message: 'Account disabled' });
  if (!user.username) {
    const legacyUsername = user.email.split('@')[0];
    const canBackfill = /^[a-z0-9._-]{3,50}$/.test(legacyUsername)
      && !await User.exists({ _id: { $ne: user._id }, username: legacyUsername });
    if (canBackfill) {
      user.username = legacyUsername;
      await user.save();
    }
  }
  await syncUserCommitteeMembership(user);
  const userTypeMatches = !userType || userType === user.role
    || (userType === 'COURSE_EXAM_COMMITTEE' && (user.committeeRoles || []).includes('COURSE_EXAM_COMMITTEE'));
  if (!userTypeMatches) return res.status(401).json({ message: 'The selected login role does not match this account' });
  if (department && !sameId(department, user.department)) {
    return res.status(401).json({ message: 'The selected department does not match this account' });
  }
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
  if (!user || !user.isActive || user.registrationStatus === 'PENDING' || user.registrationStatus === 'REJECTED' || user.tokenVersion !== payload.tokenVersion) return res.status(401).json({ message: 'Invalid refresh token' });
  await syncUserCommitteeMembership(user);
  return res.json(authPayload(user));
});

export const me = asyncHandler(async (req, res) => res.json({ user: publicUser(req.user) }));


function hasPhotoSignature(buffer, contentType) {
  if (!buffer?.length) return false;
  if (contentType === 'image/jpeg') return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (contentType === 'image/png') return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (contentType === 'image/webp') return buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  return false;
}

export const updateProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  const { firstName, lastName, phone, bio } = req.validated.body;
  user.firstName = firstName;
  user.lastName = lastName;
  user.phone = phone || undefined;
  user.bio = bio || undefined;
  await user.save();
  res.json({ user: publicUser(user), message: 'Profile updated successfully' });
});

export const uploadProfilePhoto = asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Select a JPEG, PNG, or WebP profile photo' });
  if (!hasPhotoSignature(req.file.buffer, req.file.mimetype)) {
    return res.status(400).json({ message: 'The uploaded file content is not a valid JPEG, PNG, or WebP image' });
  }
  const user = await User.findById(req.user.id).select('+profilePhoto.data');
  if (!user) return res.status(404).json({ message: 'User not found' });
  user.profilePhoto = {
    data: req.file.buffer,
    contentType: req.file.mimetype,
    fileName: String(req.file.originalname || 'profile-photo').replace(/[\r\n"\\]/g, '').slice(0, 180),
    updatedAt: new Date()
  };
  await user.save();
  res.status(201).json({ user: publicUser(user), message: 'Profile photo uploaded successfully' });
});

export const getProfilePhoto = asyncHandler(async (req, res) => {
  const user = await User.findOne({ _id: req.params.userId, isActive: true }).select('+profilePhoto.data profilePhoto.contentType profilePhoto.updatedAt');
  if (!user?.profilePhoto?.data || !user.profilePhoto.contentType) return res.status(404).json({ message: 'Profile photo not found' });
  res.setHeader('Content-Type', user.profilePhoto.contentType);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.send(user.profilePhoto.data);
});

export const deleteProfilePhoto = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).select('+profilePhoto.data');
  if (!user) return res.status(404).json({ message: 'User not found' });
  user.profilePhoto = undefined;
  await user.save();
  res.json({ user: publicUser(user), message: 'Profile photo removed' });
});
export const forgotPassword = asyncHandler(async (req, res) => {
  const user = await User.findOne({
    email: req.validated.body.email,
    isActive: true,
    $or: [{ registrationStatus: 'APPROVED' }, { registrationStatus: { $exists: false } }]
  });
  let resetToken;
  let expiresAt;
  let delivered = false;
  if (user) {
    resetToken = crypto.randomBytes(32).toString('hex');
    expiresAt = new Date(Date.now() + 1000 * 60 * 30);
    user.resetPasswordTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.resetPasswordExpiresAt = expiresAt;
    await user.save();
    try {
      delivered = await sendPasswordResetEmail(user, resetToken);
    } catch (error) {
      console.error('Password reset email delivery failed:', error.message);
    }
    if (process.env.NODE_ENV === 'production' && !delivered) {
      user.resetPasswordTokenHash = undefined;
      user.resetPasswordExpiresAt = undefined;
      await user.save();
    }
  }
  const response = { message: 'If the account exists, password reset instructions have been sent.' };
  if (process.env.NODE_ENV !== 'production' && resetToken) {
    response.resetToken = resetToken;
    response.expiresAt = expiresAt;
    if (!delivered) response.developmentMessage = 'Email delivery is not configured; use this development-only token to complete the reset.';
  }
  return res.json(response);
});

export const resetPassword = asyncHandler(async (req, res) => {
  const tokenHash = crypto.createHash('sha256').update(req.validated.body.token).digest('hex');
  const user = await User.findOne({
    resetPasswordTokenHash: tokenHash,
    resetPasswordExpiresAt: { $gt: new Date() },
    isActive: true
  }).select('+passwordHash +resetPasswordTokenHash +resetPasswordExpiresAt');
  if (!user) return res.status(400).json({ message: 'The password reset token is invalid or expired' });
  user.passwordHash = await User.hashPassword(req.validated.body.newPassword);
  user.tokenVersion += 1;
  user.resetPasswordTokenHash = undefined;
  user.resetPasswordExpiresAt = undefined;
  await user.save();
  return res.json({ message: 'Password reset successfully. You can now sign in with the new password.' });
});

export const changePassword = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).select('+passwordHash');
  const { currentPassword, newPassword } = req.validated.body;
  if (!(await user.comparePassword(currentPassword))) return res.status(400).json({ message: 'Current password is incorrect' });
  user.passwordHash = await User.hashPassword(newPassword);
  user.tokenVersion += 1;
  await user.save();
  return res.json({ ...authPayload(user), message: 'Password changed successfully' });
});
