export const EVALUATION_WEIGHTS = {
  student: 0.4,
  peer: 0.3,
  hod: 0.3
};
const MAX_RESPONSE_SCORE = 5;

export function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function scoredValues(responses = []) {
  return responses
    .filter((response) => !response.notApplicable && typeof response.score === 'number')
    .map((response) => ({ score: response.score, value: Number(response.value) > 0 ? Number(response.value) : 1 }));
}

export function scoreResponses(responses = []) {
  const scored = scoredValues(responses);
  const totalValue = scored.reduce((sum, response) => sum + response.value, 0);
  if (!totalValue) return 0;
  return scored.reduce((sum, response) => sum + (response.score * response.value), 0) / totalValue;
}

export function categoryScores(evaluations = []) {
  const buckets = new Map();
  evaluations.forEach((evaluation) => {
    evaluation.responses.forEach((response) => {
      if (response.notApplicable || typeof response.score !== 'number') return;
      if (!buckets.has(response.category)) buckets.set(response.category, []);
      buckets.get(response.category).push({ score: response.score, value: Number(response.value) > 0 ? Number(response.value) : 1 });
    });
  });

  return [...buckets.entries()].map(([category, responses]) => ({
    category,
    score: Number((responses.reduce((sum, response) => sum + (response.score * response.value), 0)
      / responses.reduce((sum, response) => sum + response.value, 0)).toFixed(2))
  }));
}

function evaluationScores(evaluations = []) {
  return evaluations
    .map((evaluation) => scoreResponses(evaluation.responses))
    .filter((score) => score > 0);
}

export function weightedOverall({ student = [], peer = [], hod = [] }) {
  const studentScore = average(evaluationScores(student));
  const peerScore = average(evaluationScores(peer));
  const hodScore = average(evaluationScores(hod));

  const studentWeighted = (studentScore / MAX_RESPONSE_SCORE) * EVALUATION_WEIGHTS.student * 100;
  const peerWeighted = (peerScore / MAX_RESPONSE_SCORE) * EVALUATION_WEIGHTS.peer * 100;
  const hodWeighted = (hodScore / MAX_RESPONSE_SCORE) * EVALUATION_WEIGHTS.hod * 100;
  const overall = studentWeighted + peerWeighted + hodWeighted;

  return {
    overall: Number(overall.toFixed(2)),
    studentScore: Number(studentScore.toFixed(2)),
    peerScore: Number(peerScore.toFixed(2)),
    hodScore: Number(hodScore.toFixed(2)),
    studentWeighted: Number(studentWeighted.toFixed(2)),
    peerWeighted: Number(peerWeighted.toFixed(2)),
    hodWeighted: Number(hodWeighted.toFixed(2)),
    weights: { ...EVALUATION_WEIGHTS }
  };
}
