import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
    audience: { type: String, enum: ['USER', 'DEPARTMENT', 'UNIVERSITY'], default: 'USER', index: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    relatedReport: { type: mongoose.Schema.Types.ObjectId, ref: 'Report' },
    relatedAssignment: { type: mongoose.Schema.Types.ObjectId, ref: 'InstructorAssignment' },
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: {
      type: String,
      enum: ['INFO', 'REMINDER', 'DEADLINE', 'REPORT', 'EVALUATION'],
      default: 'INFO'
    },
    readAt: Date
  },
  { timestamps: true }
);

notificationSchema.pre('validate', function validateAudienceTarget(next) {
  if (this.audience === 'USER' && !this.user) this.invalidate('user', 'A user is required for a user notification.');
  if (this.audience === 'DEPARTMENT' && !this.department) this.invalidate('department', 'A department is required for a department notification.');
  next();
});

notificationSchema.index(
  { user: 1, relatedReport: 1 },
  { unique: true, name: 'unique_user_related_report', partialFilterExpression: { relatedReport: { $type: 'objectId' } } }
);
notificationSchema.index(
  { user: 1, relatedAssignment: 1 },
  { unique: true, name: 'unique_user_related_assignment', partialFilterExpression: { relatedAssignment: { $type: 'objectId' } } }
);

export const Notification = mongoose.model('Notification', notificationSchema);
