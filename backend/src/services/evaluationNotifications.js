import { InstructorAssignment } from '../models/InstructorAssignment.js';
import { Notification } from '../models/Notification.js';
import { User } from '../models/User.js';
import { queueManyNotificationEmails, queueNotificationEmails } from './notificationEmail.js';
import '../models/Course.js';

function fullName(user) {
  return [user?.firstName, user?.lastName].filter(Boolean).join(' ');
}

export async function syncEvaluationNotifications(assignmentId, senderId) {
  const assignment = await InstructorAssignment.findById(assignmentId)
    .populate('instructor', 'firstName lastName')
    .populate('course', 'code title department')
    .populate('enrolledStudents', '_id')
    .populate('peerEvaluators', '_id');
  if (!assignment) return;

  await Notification.deleteMany({
    relatedAssignment: assignment._id,
    type: 'INFO',
    user: { $ne: assignment.instructor._id }
  });
  const courseName = `${assignment.course?.code || ''} - ${assignment.course?.title || ''}`.replace(/^ - | - $/g, '');
  const courseNotification = await Notification.findOneAndUpdate(
    { user: assignment.instructor._id, relatedAssignment: assignment._id },
    {
      user: assignment.instructor._id,
      audience: 'USER',
      sender: senderId,
      relatedAssignment: assignment._id,
      title: `Course assigned - ${assignment.course?.code || 'course'}`,
      message: `You have been assigned to ${courseName}. Assignment status: ${assignment.status}.`,
      type: 'INFO'
    },
    { upsert: true, new: true, runValidators: true }
  );
  await queueNotificationEmails(courseNotification);

  if (assignment.status !== 'PUBLISHED') {
    await Notification.deleteMany({ relatedAssignment: assignment._id, type: 'EVALUATION' });
    return;
  }

  const instructorName = fullName(assignment.instructor);
  const studentIds = (assignment.enrolledStudents || []).map((user) => user._id);
  const peerIds = (assignment.peerEvaluators || []).map((user) => user._id);
  const hodIds = assignment.course?.department
    ? (await User.find({ role: 'HOD', department: assignment.course.department, isActive: true }).select('_id')).map((user) => user._id)
    : [];
  const recipientIds = [...new Set([...studentIds, ...peerIds, ...hodIds].map(String))];

  await Notification.deleteMany({
    relatedAssignment: assignment._id,
    type: 'EVALUATION',
    ...(recipientIds.length ? { user: { $nin: recipientIds } } : {})
  });

  const studentSet = new Set(studentIds.map(String));
  const peerSet = new Set(peerIds.map(String));
  const notifications = await Promise.all(recipientIds.map((userId) => {
    const isStudent = studentSet.has(userId);
    const isPeer = peerSet.has(userId);
    return Notification.findOneAndUpdate(
      { user: userId, relatedAssignment: assignment._id },
      {
        user: userId,
        audience: 'USER',
        sender: senderId,
        relatedAssignment: assignment._id,
        title: `Evaluate ${instructorName} - ${assignment.course?.code || 'course'}`,
        message: isStudent
          ? `Please evaluate instructor ${instructorName} for ${courseName} from your student dashboard.`
          : isPeer
            ? `You have been assigned to complete the peer evaluation of instructor ${instructorName} for ${courseName}.`
            : `Please complete the HOD evaluation of instructor ${instructorName} for ${courseName}.`,
        type: 'EVALUATION'
      },
      { upsert: true, new: true, runValidators: true }
    );
  }));
  await queueManyNotificationEmails(notifications);
}
