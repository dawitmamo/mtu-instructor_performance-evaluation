import crypto from 'node:crypto';
import { User } from '../models/User.js';
import { recordsFromUpload } from '../services/userImport.js';
import { sendAccountApprovedEmail } from '../services/notificationEmail.js';
import { issuePasswordResetToken } from '../services/passwordResetToken.js';
import { validateUserAcademicProfile } from '../utils/academicProfile.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { requestClientOrigin } from '../utils/clientOrigin.js';
import { isMtuEmail, MTU_EMAIL_MESSAGE, normalizeMtuEmail } from '../utils/email.js';

function importError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function requiredText(value, field, rowNumber) {
  const text = String(value || '').trim();
  if (!text) throw importError(`Row ${rowNumber}: ${field} is required`);
  return text;
}

function optionalNumber(value, field, rowNumber) {
  if (value === undefined || value === null || String(value).trim() === '') return undefined;
  const number = Number(value);
  if (!Number.isFinite(number)) throw importError(`Row ${rowNumber}: ${field} must be a number`);
  return number;
}

async function importUsers(req, res, forcedRole) {
  if (!req.file) return res.status(400).json({ message: 'CSV or PDF file is required' });
  const role = forcedRole || String(req.body.role || '').toUpperCase();
  if (!['STUDENT', 'INSTRUCTOR'].includes(role)) throw importError('Import role must be Student or Instructor');
  const label = role === 'STUDENT' ? 'student' : 'instructor';
  const records = await recordsFromUpload(req.file);
  if (!records.length) throw importError(`The file contains no ${label} records`);
  if (records.length > 1000) throw importError('A single import is limited to 1000 accounts');

  const seenEmails = new Set();
  const seenUsernames = new Set();
  const prepared = [];
  for (const [index, record] of records.entries()) {
    const rowNumber = index + 2;
    const email = normalizeMtuEmail(requiredText(record.email, 'email', rowNumber));
    if (!isMtuEmail(email)) throw importError(`Row ${rowNumber}: ${MTU_EMAIL_MESSAGE}`);
    if (seenEmails.has(email)) throw importError(`Row ${rowNumber}: duplicate email ${email}`);
    seenEmails.add(email);
    const username = String(record.username || email.split('@')[0]).trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,50}$/.test(username)) throw importError(`Row ${rowNumber}: username must be 3-50 lowercase letters, numbers, dots, underscores, or hyphens`);
    if (seenUsernames.has(username)) throw importError(`Row ${rowNumber}: duplicate username ${username}`);
    seenUsernames.add(username);

    const requestedDepartment = String(record.department || req.body.department || req.user.department || '').trim();
    if (!requestedDepartment) throw importError(`Row ${rowNumber}: department is required`);
    if (req.user.role !== 'SUPER_ADMIN' && String(req.user.department || '') !== requestedDepartment) {
      throw importError(`Row ${rowNumber}: you can only import accounts into your department`, 403);
    }

    const yearLevel = optionalNumber(record.yearLevel, 'yearLevel', rowNumber);
    const gpa = optionalNumber(record.gpa, 'gpa', rowNumber);
    const profile = {
      role,
      department: requestedDepartment,
      yearLevel: role === 'STUDENT' ? yearLevel : undefined,
      gpa: role === 'STUDENT' ? gpa : undefined,
      academicStream: String(record.academicStream || '').trim() || undefined
    };
    await validateUserAcademicProfile(profile);
    if (yearLevel !== undefined && (!Number.isInteger(yearLevel) || yearLevel < 2 || yearLevel > 5)) {
      throw importError(`Row ${rowNumber}: yearLevel must be an integer from 2 to 5`);
    }
    if (gpa !== undefined && (gpa < 0 || gpa > 4)) throw importError(`Row ${rowNumber}: GPA must be between 0 and 4`);

    const existing = await User.findOne({ $or: [{ email }, { username }, { email: `${username}@mtu.edu.et` }] });
    if (existing && existing.email !== email) throw importError(`Row ${rowNumber}: username ${username} is already assigned to another account`, 409);
    if (existing && existing.role !== role) throw importError(`Row ${rowNumber}: ${email} belongs to a different account role`, 409);
    if (existing && req.user.role !== 'SUPER_ADMIN' && String(existing.department || '') !== String(req.user.department)) {
      throw importError(`Row ${rowNumber}: you cannot modify an account in another department`, 403);
    }
    prepared.push({
      existing,
      payload: {
        firstName: requiredText(record.firstName, 'firstName', rowNumber),
        lastName: requiredText(record.lastName, 'lastName', rowNumber),
        username,
        email,
        ...(role === 'STUDENT'
          ? { studentNumber: requiredText(record.studentNumber, 'studentNumber', rowNumber), yearLevel, gpa }
          : { employeeNumber: requiredText(record.employeeNumber, 'employeeNumber', rowNumber) }),
        ...profile
      }
    });
  }

  const results = [];
  const setupEmails = [];
  for (const item of prepared) {
    let user;
    let setupToken;
    if (item.existing) {
      Object.assign(item.existing, item.payload);
      if (role === 'STUDENT') {
        item.existing.employeeNumber = undefined;
      } else {
        item.existing.studentNumber = undefined;
        item.existing.yearLevel = undefined;
        item.existing.gpa = undefined;
      }
      user = await item.existing.save();
    } else {
      user = await User.create({
        ...item.payload,
        passwordHash: await User.hashPassword(crypto.randomBytes(32).toString('hex')),
        registrationStatus: 'APPROVED',
        requiresPasswordSetup: true,
        reviewedBy: req.user.id,
        reviewedAt: new Date(),
        isActive: true
      });
      ({ token: setupToken } = issuePasswordResetToken(user, { ttlMs: 1000 * 60 * 60 * 24 }));
      await user.save();
    }
    const result = {
      email: user.email,
      username: user.username,
      id: user.id,
      name: `${user.firstName} ${user.lastName}`,
      identifier: role === 'STUDENT' ? user.studentNumber : user.employeeNumber,
      setupEmailDelivered: item.existing ? undefined : false
    };
    results.push(result);
    if (setupToken) setupEmails.push({ user, result, setupToken });
  }

  for (let index = 0; index < setupEmails.length; index += 10) {
    const batch = setupEmails.slice(index, index + 10);
    await Promise.all(batch.map(async ({ user, result, setupToken }) => {
      try {
        result.setupEmailDelivered = await sendAccountApprovedEmail(user, setupToken, { accountCreated: true, clientOrigin: requestClientOrigin(req) });
        if (result.setupEmailDelivered) {
          user.setupEmailSentAt = new Date();
          await user.save();
        }
      } catch (error) {
        console.error(`Imported account setup email failed for ${user.email}:`, error.message);
      }
    }));
  }
  const setupEmailsDelivered = results.filter((item) => item.setupEmailDelivered).length;
  return res.status(201).json({
    imported: results.length,
    setupEmailsDelivered,
    role,
    users: results,
    ...(role === 'STUDENT' ? { students: results } : { instructors: results })
  });
}

export const uploadUsers = asyncHandler(async (req, res) => importUsers(req, res));
export const uploadStudents = asyncHandler(async (req, res) => importUsers(req, res, 'STUDENT'));
