import { Notification } from '../models/Notification.js';

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
}
