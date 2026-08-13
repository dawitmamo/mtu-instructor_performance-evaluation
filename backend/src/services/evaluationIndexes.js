import { Evaluation } from '../models/Evaluations.js';
import { EvaluationTemplate } from '../models/EvaluationTemplate.js';

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

  await EvaluationTemplate.updateMany({ scopeKey: { $exists: false } }, { $set: { scopeKey: 'GLOBAL' } });
  const templateIndexes = await EvaluationTemplate.collection.indexes();
  const legacyTemplateIndex = templateIndexes.find((index) => index.name === 'kind_1_version_1');
  if (legacyTemplateIndex) await EvaluationTemplate.collection.dropIndex(legacyTemplateIndex.name);
  await EvaluationTemplate.collection.createIndex(
    { kind: 1, scopeKey: 1, version: 1 },
    { unique: true, name: 'kind_1_scopeKey_1_version_1' }
  );
  await EvaluationTemplate.collection.createIndex(
    { kind: 1, scopeKey: 1, isActive: 1, version: -1 }
  );
}
