import { ExamCommittee } from '../models/ExamCommittee.js';
import { User } from '../models/User.js';

export const UNIFIED_COMMITTEE_ROLE = 'COURSE_EXAM_COMMITTEE';
const LEGACY_COMMITTEE_ROLES = ['COURSE_COMMITTEE', 'EXAM_COMMITTEE', UNIFIED_COMMITTEE_ROLE];

function hasOnlyUnifiedRole(user) {
  return user.committeeRoles?.length === 1 && user.committeeRoles[0] === UNIFIED_COMMITTEE_ROLE;
}

export async function syncUserCommitteeMembership(user) {
  const normalizedRole = LEGACY_COMMITTEE_ROLES.includes(user.role) ? 'INSTRUCTOR' : user.role;
  const isAppointed = normalizedRole === 'INSTRUCTOR' && Boolean(await ExamCommittee.exists({
    status: 'ACTIVE',
    members: user._id
  }));
  const committeeRoles = isAppointed ? [UNIFIED_COMMITTEE_ROLE] : [];
  const needsUpdate = normalizedRole !== user.role
    || (isAppointed ? !hasOnlyUnifiedRole(user) : Boolean(user.committeeRoles?.length));

  if (needsUpdate) {
    await User.updateOne({ _id: user._id }, { $set: { role: normalizedRole, committeeRoles } });
    user.role = normalizedRole;
    user.committeeRoles = committeeRoles;
  }
  return user;
}

export async function reconcileCommitteeMemberships() {
  const activeCommittees = await ExamCommittee.find({ status: 'ACTIVE' }).select('members');
  const activeMemberIds = [...new Set(activeCommittees.flatMap((committee) => committee.members.map(String)))];
  const appointedInstructorIds = await User.find({
    _id: { $in: activeMemberIds },
    role: { $in: ['INSTRUCTOR', ...LEGACY_COMMITTEE_ROLES] },
    isActive: true
  }).distinct('_id');

  await User.updateMany(
    { role: { $in: LEGACY_COMMITTEE_ROLES } },
    { $set: { role: 'INSTRUCTOR' } }
  );
  const removed = await User.updateMany(
    { _id: { $nin: appointedInstructorIds }, committeeRoles: { $in: LEGACY_COMMITTEE_ROLES } },
    { $pull: { committeeRoles: { $in: LEGACY_COMMITTEE_ROLES } } }
  );
  const appointed = await User.updateMany(
    { _id: { $in: appointedInstructorIds } },
    { $set: { committeeRoles: [UNIFIED_COMMITTEE_ROLE] } }
  );
  return { activeMembers: appointedInstructorIds.length, appointed: appointed.modifiedCount, removed: removed.modifiedCount };
}
