import { Notification } from '../models/Notification.js';
import { EmailDelivery } from '../models/EmailDelivery.js';
import { User } from '../models/User.js';

const desiredNames = new Set(['unique_user_related_report', 'unique_user_related_assignment']);

export async function ensureNotificationIndexes() {
  const indexes = await Notification.collection.indexes();
  const obsolete = indexes.filter((index) => {
    if (desiredNames.has(index.name)) return false;
    const fields = Object.keys(index.key || {});
    return fields[0] === 'user' && (fields.includes('relatedReport') || fields.includes('relatedAssignment'));
  });
  for (const index of obsolete) await Notification.collection.dropIndex(index.name);

  await Notification.collection.createIndex(
    { user: 1, relatedReport: 1 },
    {
      unique: true,
      name: 'unique_user_related_report',
      partialFilterExpression: { relatedReport: { $type: 'objectId' } }
    }
  );
  await Notification.collection.createIndex(
    { user: 1, relatedAssignment: 1 },
    {
      unique: true,
      name: 'unique_user_related_assignment',
      partialFilterExpression: { relatedAssignment: { $type: 'objectId' } }
    }
  );

  const emailDeliveryIndexes = await EmailDelivery.collection.indexes();
  const obsoleteEmailDeliveryIndexes = emailDeliveryIndexes.filter((index) => {
    if (index.name === 'unique_notification_email_recipient') return false;
    const fields = Object.keys(index.key || {});
    return fields.length === 2 && fields[0] === 'notification' && fields[1] === 'recipient';
  });
  for (const index of obsoleteEmailDeliveryIndexes) await EmailDelivery.collection.dropIndex(index.name);
  await EmailDelivery.collection.createIndex(
    { notification: 1, recipient: 1 },
    { unique: true, name: 'unique_notification_email_recipient' }
  );
  await Promise.all([
    Notification.collection.createIndex(
      { user: 1, createdAt: -1 },
      { name: 'notification_user_feed' }
    ),
    Notification.collection.createIndex(
      { audience: 1, department: 1, createdAt: -1 },
      { name: 'notification_audience_feed' }
    ),
    EmailDelivery.collection.createIndex(
      { status: 1, nextAttemptAt: 1, createdAt: 1 },
      { name: 'email_delivery_retry_queue' }
    ),
    User.collection.createIndex(
      { department: 1, role: 1, isActive: 1, registrationStatus: 1 },
      { name: 'user_department_recipient_lookup' }
    )
  ]);
}
