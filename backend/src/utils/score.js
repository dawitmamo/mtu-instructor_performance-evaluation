const WEIGHTS = {
  student: 0.5,
  peer: 0.2,
  hod: 0.3
};

export function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function scoredValues(responses = []) {
  return responses
    .filter((response) => !response.notApplicable && typeof response.score === 'number')
    .map((response) => response.score);
}

export function scoreResponses(responses = []) {
  return average(scoredValues(responses));
}

export function categoryScores(evaluations = []) {
  const buckets = new Map();
  evaluations.forEach((evaluation) => {
    evaluation.responses.forEach((response) => {
      if (response.notApplicable || typeof response.score !== 'number') return;
      if (!buckets.has(response.category)) buckets.set(response.category, []);
      buckets.get(response.category).push(response.score);
    });
  });

  return [...buckets.entries()].map(([category, scores]) => ({
    category,
    score: Number(average(scores).toFixed(2))
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

  const available = [
    { score: studentScore, weight: WEIGHTS.student, count: student.length },
    { score: peerScore, weight: WEIGHTS.peer, count: peer.length },
    { score: hodScore, weight: WEIGHTS.hod, count: hod.length }
  ].filter((item) => item.count && item.score > 0);
  const availableWeight = available.reduce((sum, item) => sum + item.weight, 0);
  const overall = availableWeight
    ? available.reduce((sum, item) => sum + item.score * item.weight, 0) / availableWeight
    : 0;

  return {
    overall: Number(overall.toFixed(2)),
    studentScore: Number(studentScore.toFixed(2)),
    peerScore: Number(peerScore.toFixed(2)),
    hodScore: Number(hodScore.toFixed(2))
  };
}
