import { Course } from '../models/Course.js';
import { CoursePreference } from '../models/CoursePreference.js';
import { Evaluation } from '../models/Evaluations.js';
import { InstructorAssignment } from '../models/InstructorAssignment.js';
import { Notification } from '../models/Notification.js';
import { Semester } from '../models/Semester.js';
import { User } from '../models/User.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { queueManyNotificationEmails, queueNotificationEmails } from '../services/notificationEmail.js';

function sameId(first, second) {
  return String(first?._id || first) === String(second?._id || second);
}

function httpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function requireDepartment(user) {
  if (!user.department) throw httpError('Your account must belong to a department', 403);
  return user.department;
}

function populatePreference(query) {
  return query
    .populate('instructor', 'firstName lastName email employeeNumber academicStream')
    .populate('department', 'name code')
    .populate('semester', 'name academicYear status startsAt endsAt')
    .populate('choices', 'code title creditHours level yearLevel academicStream')
    .populate('recommendedCourse', 'code title creditHours level yearLevel academicStream')
    .populate('recommendedBy', 'firstName lastName email role')
    .populate('confirmedCourse', 'code title creditHours level yearLevel academicStream')
    .populate('confirmedBy', 'firstName lastName email role');
}

async function occupiedCourse(courseIds, semester, instructorId) {
  const [assignment, preference] = await Promise.all([
    InstructorAssignment.findOne({ course: { $in: courseIds }, semester, instructor: { $ne: instructorId } }).populate('course', 'code title'),
    CoursePreference.findOne({ semester, confirmedCourse: { $in: courseIds }, instructor: { $ne: instructorId }, status: { $in: ['FINALIZED', 'CONFIRMED'] } }).populate('confirmedCourse', 'code title')
  ]);
  return assignment?.course || preference?.confirmedCourse || null;
}

async function notifyManagers({ instructor, department, semester, courses }) {
  const recipients = await User.find({
    _id: { $ne: instructor._id },
    department,
    isActive: true,
    $or: [{ role: 'HOD' }, { committeeRoles: 'COURSE_EXAM_COMMITTEE' }]
  }).select('_id');
  if (!recipients.length) return;
  const name = [instructor.firstName, instructor.lastName].filter(Boolean).join(' ');
  const ranked = courses.map((course, index) => `${index + 1}. ${course.code} - ${course.title}`).join('; ');
  const notifications = await Notification.insertMany(recipients.map((recipient) => ({
    user: recipient._id,
    audience: 'USER',
    sender: instructor._id,
    title: 'Instructor course preference submitted',
    message: `${name} submitted course preferences for ${semester.name} ${semester.academicYear}: ${ranked}`,
    type: 'INFO'
  })));
  await queueManyNotificationEmails(notifications);
}

export const getInstructorCoursePreferences = asyncHandler(async (req, res) => {
  const department = requireDepartment(req.user);
  const departmentCourses = await Course.find({ department }).select('_id');
  const courseIds = departmentCourses.map((course) => course._id);
  const [courses, preferences, occupiedAssignments, occupiedPreferences] = await Promise.all([
    Course.find({ department }).populate('semester', 'name academicYear status startsAt endsAt').sort({ createdAt: -1, code: 1 }),
    populatePreference(CoursePreference.find({ instructor: req.user._id }).sort({ createdAt: -1 })),
    InstructorAssignment.find({ course: { $in: courseIds }, instructor: { $ne: req.user._id } }).select('course'),
    CoursePreference.find({ department, instructor: { $ne: req.user._id }, status: { $in: ['FINALIZED', 'CONFIRMED'] } }).select('confirmedCourse')
  ]);
  const occupied = new Set([
    ...occupiedAssignments.map((assignment) => String(assignment.course)),
    ...occupiedPreferences.map((preference) => String(preference.confirmedCourse))
  ]);
  res.json({ courses, preferences, occupiedCourseIds: [...occupied] });
});

export const submitCoursePreference = asyncHandler(async (req, res) => {
  const department = requireDepartment(req.user);
  const { semester: semesterId, choices } = req.validated.body;
  const semester = await Semester.findById(semesterId);
  if (!semester) throw httpError('Semester not found', 404);
  if (['CLOSED', 'ARCHIVED'].includes(semester.status)) throw httpError('Course preferences cannot be submitted for a closed or archived semester', 409);

  const courses = await Course.find({ _id: { $in: choices }, department, semester: semesterId });
  if (courses.length !== choices.length) throw httpError('Every selected course must belong to your department and semester', 400);
  const orderedCourses = choices.map((choice) => courses.find((course) => sameId(course, choice)));
  const existing = await CoursePreference.findOne({ instructor: req.user._id, semester: semesterId });
  if (['RECOMMENDED', 'FINALIZED', 'CONFIRMED'].includes(existing?.status)) throw httpError('A course preference under committee/HOD decision cannot be changed until the HOD resets the semester allocation', 409);
  const preference = await CoursePreference.findOneAndUpdate(
    { instructor: req.user._id, semester: semesterId },
    {
      instructor: req.user._id,
      department,
      semester: semesterId,
      choices,
      status: 'SUBMITTED',
      submittedAt: new Date(),
      $unset: {
        recommendedCourse: 1, recommendedBy: 1, recommendedAt: 1, committeeNote: 1,
        confirmedCourse: 1, confirmedBy: 1, confirmedAt: 1, hodNote: 1
      }
    },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );
  await notifyManagers({ instructor: req.user, department, semester, courses: orderedCourses });
  res.status(existing ? 200 : 201).json({
    preference: await populatePreference(CoursePreference.findById(preference._id)),
    message: 'Your ranked course preferences were submitted to the HOD and Course and Exam Committee'
  });
});

export const getCoursePreferenceManagement = asyncHandler(async (req, res) => {
  const department = requireDepartment(req.user);
  const semester = req.query.semester;
  const filter = semester ? { department, semester } : { department };
  const courses = await Course.find(semester ? { department, semester } : { department }).select('_id');
  const courseIds = courses.map((course) => course._id);
  const [preferences, populatedCourses, assignments] = await Promise.all([
    populatePreference(CoursePreference.find(filter).sort({ createdAt: 1 })),
    Course.find(semester ? { department, semester } : { department }).populate('semester', 'name academicYear status').sort({ code: 1 }),
    InstructorAssignment.find({ course: { $in: courseIds }, ...(semester ? { semester } : {}) })
      .populate('course', 'code title department')
      .populate('instructor', 'firstName lastName email employeeNumber')
      .populate('semester', 'name academicYear')
  ]);
  res.json({ preferences, courses: populatedCourses, assignments });
});

function requirePreferenceCourse(preference, courseId) {
  if (!preference.choices.some((choice) => sameId(choice, courseId))) {
    throw httpError('Select one of the instructor’s submitted course choices', 400);
  }
}

export const recommendCoursePreference = asyncHandler(async (req, res) => {
  if (!(req.user.committeeRoles || []).includes('COURSE_EXAM_COMMITTEE')) {
    throw httpError('Only an appointed Course and Exam Committee member can make the first recommendation', 403);
  }
  const department = requireDepartment(req.user);
  const preference = await CoursePreference.findById(req.params.id);
  if (!preference || !sameId(preference.department, department)) throw httpError('Course preference not found', 404);
  if (['FINALIZED', 'CONFIRMED'].includes(preference.status)) throw httpError('This course allocation is already finalized', 409);

  const { course: courseId, note } = req.validated.body;
  requirePreferenceCourse(preference, courseId);
  const course = await Course.findOne({ _id: courseId, department, semester: preference.semester });
  if (!course) throw httpError('Selected course was not found in this department and semester', 404);
  const occupied = await occupiedCourse([courseId], preference.semester, preference.instructor);
  if (occupied) throw httpError(`${occupied.code} - ${occupied.title} is already held by another instructor`, 409);

  preference.status = 'RECOMMENDED';
  preference.recommendedCourse = course._id;
  preference.recommendedBy = req.user._id;
  preference.recommendedAt = new Date();
  preference.committeeNote = note;
  await preference.save();

  const [hods, instructor, semester] = await Promise.all([
    User.find({ department, role: 'HOD', isActive: true }).select('_id'),
    User.findById(preference.instructor).select('firstName lastName'),
    Semester.findById(preference.semester).select('name academicYear')
  ]);
  if (hods.length) {
    const notifications = await Notification.insertMany(hods.map((hod) => ({
      user: hod._id,
      audience: 'USER',
      sender: req.user._id,
      title: 'Course recommendation awaiting HOD decision',
      message: `The Course and Exam Committee recommends ${course.code} - ${course.title} for ${instructor?.name || 'the instructor'} in ${semester?.name || 'the selected semester'} ${semester?.academicYear || ''}.`,
      type: 'INFO'
    })));
    await queueManyNotificationEmails(notifications);
  }
  res.json({
    preference: await populatePreference(CoursePreference.findById(preference._id)),
    message: `${course.code} - ${course.title} was recommended to the HOD for final approval`
  });
});

export const finalizeCoursePreference = asyncHandler(async (req, res) => {
  if (req.user.role !== 'HOD') throw httpError('Only the department HOD can finalize a course allocation', 403);
  const department = requireDepartment(req.user);
  const preference = await CoursePreference.findById(req.params.id);
  if (!preference || !sameId(preference.department, department)) throw httpError('Course preference not found', 404);
  if (['FINALIZED', 'CONFIRMED'].includes(preference.status)) throw httpError('This course allocation is already finalized', 409);
  if (preference.status !== 'RECOMMENDED' || !preference.recommendedCourse) {
    throw httpError('The Course and Exam Committee must recommend a course before HOD finalization', 409);
  }

  const { course: courseId, note } = req.validated.body;
  requirePreferenceCourse(preference, courseId);
  const course = await Course.findOne({ _id: courseId, department, semester: preference.semester });
  if (!course) throw httpError('Selected course was not found in this department and semester', 404);
  const occupied = await occupiedCourse([courseId], preference.semester, preference.instructor);
  if (occupied) throw httpError(`${occupied.code} - ${occupied.title} is already assigned to another instructor`, 409);

  preference.status = 'FINALIZED';
  preference.confirmedCourse = course._id;
  preference.confirmedBy = req.user._id;
  preference.confirmedAt = new Date();
  preference.hodNote = note;
  try {
    await preference.save();
  } catch (error) {
    if (error?.code === 11000) throw httpError('This course was just finalized for another instructor', 409);
    throw error;
  }

  let assignment;
  try {
    assignment = await InstructorAssignment.findOneAndUpdate(
      { instructor: preference.instructor, course: course._id, semester: preference.semester },
      { $setOnInsert: { instructor: preference.instructor, course: course._id, semester: preference.semester, enrolledStudents: [], peerEvaluators: [], status: 'DRAFT', assignedBy: req.user._id } },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );
  } catch (error) {
    await CoursePreference.updateOne(
      { _id: preference._id, confirmedBy: req.user._id },
      { status: 'RECOMMENDED', $unset: { confirmedCourse: 1, confirmedBy: 1, confirmedAt: 1, hodNote: 1 } }
    );
    throw error;
  }

  const semester = await Semester.findById(preference.semester).select('name academicYear');
  const notification = await Notification.create({
    user: preference.instructor,
    audience: 'USER',
    sender: req.user._id,
    title: 'Your course allocation was finalized',
    message: `Your HOD finalized ${course.code} - ${course.title} as your course for ${semester?.name || 'the semester'} ${semester?.academicYear || ''}.`,
    type: 'INFO'
  });
  await queueNotificationEmails(notification);
  res.json({
    preference: await populatePreference(CoursePreference.findById(preference._id)),
    assignment,
    notification,
    message: `${course.code} - ${course.title} was finalized and the instructor was notified`
  });
});

export const resetCourseAllocations = asyncHandler(async (req, res) => {
  if (req.user.role !== 'HOD') throw httpError('Only the department HOD can reset course allocations', 403);
  const department = requireDepartment(req.user);
  const { semester: semesterId } = req.validated.body;
  const semester = await Semester.findById(semesterId);
  if (!semester) throw httpError('Semester not found', 404);
  const preferences = await CoursePreference.find({ department, semester: semesterId });
  const allocationPairs = preferences
    .filter((item) => item.confirmedCourse)
    .map((item) => ({ instructor: item.instructor, course: item.confirmedCourse }));
  const assignments = allocationPairs.length
    ? await InstructorAssignment.find({ semester: semesterId, $or: allocationPairs })
    : [];
  const assignmentIds = assignments.map((item) => item._id);
  const evaluationsExist = assignmentIds.length ? await Evaluation.exists({ assignment: { $in: assignmentIds } }) : null;
  if (assignments.some((item) => item.status !== 'DRAFT') || evaluationsExist) {
    throw httpError('Allocations with verified/published assignments or submitted evaluations cannot be reset. Archive the semester or create a new allocation cycle instead.', 409);
  }

  if (assignmentIds.length) await InstructorAssignment.deleteMany({ _id: { $in: assignmentIds }, status: 'DRAFT' });
  await CoursePreference.updateMany(
    { department, semester: semesterId },
    {
      $set: { status: 'SUBMITTED', submittedAt: new Date() },
      $unset: {
        recommendedCourse: 1, recommendedBy: 1, recommendedAt: 1, committeeNote: 1,
        confirmedCourse: 1, confirmedBy: 1, confirmedAt: 1, hodNote: 1
      }
    }
  );
  res.json({
    resetPreferences: preferences.length,
    removedDraftAssignments: assignmentIds.length,
    message: `Course allocation decisions were reset for ${semester.name} ${semester.academicYear}. The course catalog and evaluation history were preserved.`
  });
});
