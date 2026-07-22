import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
    audience: { type: String, enum: ['USER', 'DEPARTMENT', 'UNIVERSITY'], default: 'USER', index: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    relatedReport: { type: mongoose.Schema.Types.ObjectId, ref: 'Report' },
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: {
      type: String,
      enum: ['INFO', 'REMINDER', 'DEADLINE', 'REPORT'],
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
  { unique: true, partialFilterExpression: { relatedReport: { $exists: true } } }
);

export const Notification = mongoose.model('Notification', notificationSchema);
