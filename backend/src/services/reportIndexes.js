import { Report } from '../models/Report.js';

const legacyIndexFields = JSON.stringify({ instructor: 1, semester: 1 });

export async function ensureReportIndexes() {
  const collection = Report.collection;
  const indexes = await collection.indexes().catch((error) => {
    if (error?.codeName === 'NamespaceNotFound') return [];
    throw error;
  });
  for (const index of indexes) {
    if (index.unique && JSON.stringify(index.key) === legacyIndexFields) {
      await collection.dropIndex(index.name);
    }
  }
  await collection.createIndex(
    { instructor: 1, semester: 1, assignment: 1 },
    { unique: true, name: 'unique_instructor_semester_course_report', partialFilterExpression: { assignment: { $type: 'objectId' } } }
  );
}
