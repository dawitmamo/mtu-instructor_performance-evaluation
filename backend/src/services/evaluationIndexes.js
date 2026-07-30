import { Evaluation } from '../models/Evaluations.js';

const desiredNames = new Set(['unique_peer_evaluator_assignment', 'unique_hod_evaluator_assignment']);

export async function ensureEvaluationIndexes() {
  const indexes = await Evaluation.collection.indexes();
  const obsolete = indexes.filter((index) => {
    if (desiredNames.has(index.name)) return false;
    const fields = Object.keys(index.key || {});
    return fields[0] === 'evaluator' && (
      fields.includes('instructor')
      || fields.includes('semester')
      || fields.includes('assignment')
    );
  });
  for (const index of obsolete) await Evaluation.collection.dropIndex(index.name);

  await Evaluation.collection.createIndex(
    { evaluator: 1, assignment: 1 },
    { unique: true, name: 'unique_peer_evaluator_assignment', partialFilterExpression: { kind: 'PEER' } }
  );
  await Evaluation.collection.createIndex(
    { evaluator: 1, assignment: 1 },
    { unique: true, name: 'unique_hod_evaluator_assignment', partialFilterExpression: { kind: 'HOD' } }
  );
}
