import { Department } from '../models/Department.js';
import { Schedule } from '../models/Schedule.js';
import { Semester } from '../models/Semester.js';
import { asyncHandler } from '../utils/asyncHandler.js';

function sameId(first, second) {
  return String(first?._id || first) === String(second?._id || second);
}

function canManageSchedules(user) {
  return ['SUPER_ADMIN', 'HOD', 'EXAM_COMMITTEE'].includes(user.role)
    || (user.committeeRoles || []).some((role) => ['COURSE_COMMITTEE', 'EXAM_COMMITTEE'].includes(role));
}

function scopedDepartment(req, requestedDepartment) {
  if (req.user.role === 'SUPER_ADMIN') return requestedDepartment;
  if (!req.user.department) {
    const error = new Error('Your account must belong to a department');
    error.statusCode = 403;
    throw error;
  }
  if (requestedDepartment && !sameId(requestedDepartment, req.user.department)) {
    const error = new Error('You can only manage schedules for your department');
    error.statusCode = 403;
    throw error;
  }
  return req.user.department;
}

function scheduleQuery(query) {
  return query
    .select('-fileData')
    .populate('department', 'name code')
    .populate('semester', 'name academicYear status')
    .populate('uploadedBy', 'firstName lastName role committeeRoles');
}

function visibleFilter(user) {
  if (user.role === 'SUPER_ADMIN') return {};
  if (!user.department) return { _id: null };
  const filter = { department: user.department };
  if (!canManageSchedules(user)) filter.status = 'PUBLISHED';
  return filter;
}

async function validateRelations(department, semester) {
  if (!department || !await Department.exists({ _id: department })) {
    const error = new Error('Department not found');
    error.statusCode = 404;
    throw error;
  }
  if (!await Semester.exists({ _id: semester })) {
    const error = new Error('Semester not found');
    error.statusCode = 404;
    throw error;
  }
}

function schedulePayload(req, department, existing) {
  const { title, description = '', scheduleType, semester, status = 'PUBLISHED' } = req.validated.body;
  if (!description.trim() && !req.file && !existing?.fileName) {
    const error = new Error('Provide schedule details or attach a PDF/CSV file');
    error.statusCode = 400;
    throw error;
  }
  return {
    title,
    description,
    scheduleType,
    semester,
    status,
    department,
    uploadedBy: req.user.id,
    publishedAt: status === 'PUBLISHED' ? new Date() : undefined,
    ...(req.file ? {
      fileName: req.file.originalname,
      fileContentType: req.file.mimetype === 'application/pdf' ? 'application/pdf' : 'text/csv',
      fileData: req.file.buffer
    } : {})
  };
}

export const listSchedules = asyncHandler(async (req, res) => {
  const schedules = await scheduleQuery(Schedule.find(visibleFilter(req.user))).sort({ createdAt: -1 });
  res.json({ schedules });
});

export const createSchedule = asyncHandler(async (req, res) => {
  const department = scopedDepartment(req, req.validated.body.department);
  await validateRelations(department, req.validated.body.semester);
  const created = await Schedule.create(schedulePayload(req, department));
  const schedule = await scheduleQuery(Schedule.findById(created._id));
  res.status(201).json({ schedule });
});

export const updateSchedule = asyncHandler(async (req, res) => {
  const existing = await Schedule.findById(req.params.id);
  if (!existing) return res.status(404).json({ message: 'Schedule not found' });
  scopedDepartment(req, existing.department);
  const department = scopedDepartment(req, req.validated.body.department || existing.department);
  await validateRelations(department, req.validated.body.semester);
  Object.assign(existing, schedulePayload(req, department, existing));
  await existing.save();
  const schedule = await scheduleQuery(Schedule.findById(existing._id));
  res.json({ schedule });
});

export const downloadSchedule = asyncHandler(async (req, res) => {
  const schedule = await Schedule.findById(req.params.id).select('+fileData');
  if (!schedule || !schedule.fileData) return res.status(404).json({ message: 'Schedule file not found' });
  const permitted = req.user.role === 'SUPER_ADMIN'
    || (req.user.department && sameId(req.user.department, schedule.department)
      && (schedule.status === 'PUBLISHED' || canManageSchedules(req.user)));
  if (!permitted) return res.status(404).json({ message: 'Schedule file not found' });
  const safeName = String(schedule.fileName || 'schedule').replace(/[\r\n"]/g, '_');
  res.setHeader('Content-Type', schedule.fileContentType || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
  res.send(schedule.fileData);
});
