import mongoose from 'mongoose';

const emailDeliverySchema = new mongoose.Schema(
  {
    notification: { type: mongoose.Schema.Types.ObjectId, ref: 'Notification', required: true, index: true },
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    status: { type: String, enum: ['PENDING', 'SENDING', 'SENT', 'FAILED'], default: 'PENDING', index: true },
    attempts: { type: Number, default: 0, min: 0 },
    lastError: { type: String, maxlength: 1000 },
    nextAttemptAt: { type: Date, index: true },
    sentAt: Date
  },
  { timestamps: true }
);

emailDeliverySchema.index(
  { notification: 1, recipient: 1 },
  { unique: true, name: 'unique_notification_email_recipient' }
);
emailDeliverySchema.index(
  { status: 1, nextAttemptAt: 1, createdAt: 1 },
  { name: 'email_delivery_retry_queue' }
);

export const EmailDelivery = mongoose.model('EmailDelivery', emailDeliverySchema);
