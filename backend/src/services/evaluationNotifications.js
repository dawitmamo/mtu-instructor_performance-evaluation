import { InstructorAssignment } from '../models/InstructorAssignment.js';
import { Notification } from '../models/Notification.js';
import '../models/User.js';
import '../models/Course.js';

function fullName(user) {
  return [user?.firstName, user?.lastName].filter(Boolean).join(' ');
}

export async function syncEvaluationNotifications(assignmentId, senderId) {
  const assignment = await InstructorAssignment.findById(assignmentId)
    .populate('instructor', 'firstName lastName')
    .populate('course', 'code title')
    .populate('enrolledStudents', '_id')
    .populate('peerEvaluators', '_id');
  if (!assignment) return;

  if (assignment.status !== 'PUBLISHED') {
    await Notification.deleteMany({ relatedAssignment: assignment._id, type: 'EVALUATION' });
    return;
  }

  const instructorName = fullName(assignment.instructor);
  const courseName = `${assignment.course?.code || ''} - ${assignment.course?.title || ''}`.replace(/^ - | - $/g, '');
  const studentIds = (assignment.enrolledStudents || []).map((user) => user._id);
  const peerIds = (assignment.peerEvaluators || []).map((user) => user._id);
  const recipientIds = [...new Set([...studentIds, ...peerIds].map(String))];

  await Notification.deleteMany({
    relatedAssignment: assignment._id,
    type: 'EVALUATION',
    ...(recipientIds.length ? { user: { $nin: recipientIds } } : {})
  });

  const studentSet = new Set(studentIds.map(String));
  await Promise.all(recipientIds.map((userId) => {
    const isStudent = studentSet.has(userId);
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
          : `You have been assigned to complete the peer evaluation of instructor ${instructorName} for ${courseName}.`,
        type: 'EVALUATION'
      },
      { upsert: true, new: true, runValidators: true }
    );
  }));
}
