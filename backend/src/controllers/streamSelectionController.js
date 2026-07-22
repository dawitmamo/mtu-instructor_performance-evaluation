import { ACADEMIC_STREAMS } from '../constants/academicStreams.js';
import { Department } from '../models/Department.js';
import { Semester } from '../models/Semester.js';
import { StreamPreference } from '../models/StreamPreference.js';
import { StreamSelectionRound } from '../models/StreamSelectionRound.js';
import { User } from '../models/User.js';
import { asyncHandler } from '../utils/asyncHandler.js';

function sameId(first, second) {
  return String(first?._id || first) === String(second?._id || second);
}

function httpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function eceDepartmentFor(user) {
  if (!user.department) throw httpError('Your account must belong to a department', 403);
  const department = await Department.findById(user.department).select('name code');
  if (!department || department.code !== 'ECE') {
    throw httpError('Stream selection is available only to Electrical and Computer Engineering', 403);
  }
  return department;
}

function populateRound(query) {
  return query
    .populate('department', 'name code')
    .populate('semester', 'name academicYear startsAt endsAt status')
    .populate('createdBy', 'firstName lastName email')
    .populate('allocatedBy', 'firstName lastName email');
}

function populatePreferences(query) {
  return query
    .populate('student', 'firstName lastName email studentNumber yearLevel gpa')
    .populate('allocatedBy', 'firstName lastName email');
}

export const getStudentStreamSelection = asyncHandler(async (req, res) => {
  const department = await eceDepartmentFor(req.user);
  const eligible = req.user.role === 'STUDENT' && req.user.yearLevel === 3;
  if (!eligible) {
    return res.json({
      eligible: false,
      reason: 'Stream preferences are submitted by Electrical and Computer Engineering Year 3 students during second semester.',
      department,
      round: null,
      preference: null
    });
  }

  const round = await populateRound(StreamSelectionRound.findOne({
    department: department._id,
    status: { $in: ['OPEN', 'CLOSED', 'ALLOCATED'] }
  }).sort({ createdAt: -1 }));
  const preference = round
    ? await StreamPreference.findOne({ round: round._id, student: req.user._id }).populate('allocatedBy', 'firstName lastName email')
    : null;

  return res.json({
    eligible: true,
    department,
    gpa: req.user.gpa,
    round,
    preference
  });
});

export const submitStreamPreferences = asyncHandler(async (req, res) => {
  const department = await eceDepartmentFor(req.user);
  if (req.user.yearLevel !== 3) throw httpError('Only Year 3 students can submit stream preferences', 403);

  const round = await StreamSelectionRound.findById(req.validated.body.round);
  if (!round || !sameId(round.department, department)) throw httpError('Stream selection round not found', 404);
  if (round.status !== 'OPEN') throw httpError('This stream selection round is not open for submissions', 409);

  const preference = await StreamPreference.findOneAndUpdate(
    { round: round._id, student: req.user._id },
    {
      round: round._id,
      student: req.user._id,
      choices: req.validated.body.choices,
      gpaSnapshot: req.user.gpa,
      status: 'SUBMITTED',
      submittedAt: new Date(),
      $unset: { allocatedStream: 1, allocationRank: 1, allocatedBy: 1 }
    },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );
  return res.status(201).json({ preference });
});

export const getStreamSelectionManagement = asyncHandler(async (req, res) => {
  const department = await eceDepartmentFor(req.user);
  const rounds = await populateRound(StreamSelectionRound.find({ department: department._id }).sort({ createdAt: -1 }));
  const roundIds = rounds.map((round) => round._id);
  const preferences = await populatePreferences(StreamPreference.find({ round: { $in: roundIds } }));
  const eligibleStudents = await User.find({
    role: 'STUDENT',
    department: department._id,
    yearLevel: 3,
    isActive: true
  }).select('firstName lastName email studentNumber yearLevel gpa').sort({ gpa: -1, lastName: 1 });

  return res.json({ department, rounds, preferences, eligibleStudents });
});

export const saveStreamSelectionRound = asyncHandler(async (req, res) => {
  const department = await eceDepartmentFor(req.user);
  const { semester, capacities, status = 'DRAFT' } = req.validated.body;
  if (!(await Semester.exists({ _id: semester }))) throw httpError('Semester not found', 404);

  const existing = await StreamSelectionRound.findOne({ department: department._id, semester });
  if (existing?.status === 'ALLOCATED') {
    throw httpError('An allocated stream selection round cannot be changed', 409);
  }

  const round = await StreamSelectionRound.findOneAndUpdate(
    { department: department._id, semester },
    {
      department: department._id,
      semester,
      eligibleYearLevel: 3,
      capacities,
      status,
      createdBy: existing?.createdBy || req.user._id
    },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );
  return res.status(existing ? 200 : 201).json({ round: await populateRound(StreamSelectionRound.findById(round._id)) });
});

export const allocateStreams = asyncHandler(async (req, res) => {
  const department = await eceDepartmentFor(req.user);
  const round = await StreamSelectionRound.findById(req.params.id);
  if (!round || !sameId(round.department, department)) throw httpError('Stream selection round not found', 404);
  if (round.status !== 'CLOSED') throw httpError('Close the submission round before running allocation', 409);
  if (round.status === 'ALLOCATED') throw httpError('This round has already been allocated', 409);

  const preferences = await populatePreferences(StreamPreference.find({ round: round._id }));
  if (!preferences.length) throw httpError('No student preferences have been submitted', 409);
  const eligibleStudentCount = await User.countDocuments({ role: 'STUDENT', department: department._id, yearLevel: 3, isActive: true });
  if (preferences.length !== eligibleStudentCount) {
    throw httpError(`${preferences.length} of ${eligibleStudentCount} eligible students submitted preferences. Collect every submission before allocation.`, 409);
  }
  const missingGpa = preferences.filter((preference) => typeof preference.student?.gpa !== 'number');
  if (missingGpa.length) {
    throw httpError(`GPA is missing for ${missingGpa.length} submitted student(s). Update their GPA before allocation.`, 400);
  }

  const remaining = Object.fromEntries(ACADEMIC_STREAMS.map((stream) => [stream, round.capacities.find((item) => item.academicStream === stream)?.seats || 0]));
  const totalCapacity = Object.values(remaining).reduce((total, seats) => total + seats, 0);
  if (totalCapacity < preferences.length) {
    throw httpError(`Total capacity is ${totalCapacity}, but ${preferences.length} students submitted preferences.`, 400);
  }

  preferences.sort((first, second) =>
    second.student.gpa - first.student.gpa
    || new Date(first.submittedAt) - new Date(second.submittedAt)
    || String(first.student._id).localeCompare(String(second.student._id))
  );

  const results = preferences.map((preference) => {
    let allocatedStream = preference.choices.find((stream) => remaining[stream] > 0);
    let allocationRank = preference.choices.indexOf(allocatedStream) + 1;
    if (!allocatedStream) {
      allocatedStream = [...ACADEMIC_STREAMS]
        .filter((stream) => remaining[stream] > 0)
        .sort((first, second) => remaining[second] - remaining[first] || ACADEMIC_STREAMS.indexOf(first) - ACADEMIC_STREAMS.indexOf(second))[0];
      allocationRank = 4;
    }
    remaining[allocatedStream] -= 1;
    return {
      preference,
      allocatedStream,
      allocationRank,
      gpaSnapshot: preference.student.gpa
    };
  });

  await StreamPreference.bulkWrite(results.map((result) => ({
    updateOne: {
      filter: { _id: result.preference._id },
      update: {
        allocatedStream: result.allocatedStream,
        allocationRank: result.allocationRank,
        gpaSnapshot: result.gpaSnapshot,
        status: 'ALLOCATED',
        allocatedBy: req.user._id
      }
    }
  })));

  round.status = 'ALLOCATED';
  round.allocatedBy = req.user._id;
  round.allocatedAt = new Date();
  await round.save();

  const allocatedPreferences = await populatePreferences(StreamPreference.find({ round: round._id }));
  return res.json({
    round: await populateRound(StreamSelectionRound.findById(round._id)),
    preferences: allocatedPreferences,
    remainingCapacity: remaining
  });
});
