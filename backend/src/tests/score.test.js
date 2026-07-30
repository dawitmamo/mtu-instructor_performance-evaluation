import { categoryScores, weightedOverall } from '../utils/score.js';

test('computes weighted evaluation score', () => {
  const result = weightedOverall({ student: [{ responses: [{ score: 4 }, { score: 5 }] }], peer: [{ responses: [{ score: 3 }, { score: 4 }] }], hod: [{ responses: [{ score: 5 }, { score: 5 }] }] });
  expect(result.overall).toBe(4.35);
  expect(result.studentWeighted).toBe(1.8);
  expect(result.peerWeighted).toBe(1.05);
  expect(result.hodWeighted).toBe(1.5);
});

test('ignores not applicable responses in scores', () => {
  const evaluations = [{ responses: [{ category: 'Core Competency', score: 5 }, { category: 'Core Competency', notApplicable: true }] }];
  expect(categoryScores(evaluations)).toEqual([{ category: 'Core Competency', score: 5 }]);
  expect(weightedOverall({ student: evaluations }).studentScore).toBe(5);
  expect(weightedOverall({ student: [{ responses: [{ category: 'Core Competency', notApplicable: true }] }] }).studentScore).toBe(0);
});

test('keeps missing evaluator groups at zero without changing the approved weights', () => {
  const result = weightedOverall({ student: [{ responses: [{ score: 5 }] }] });
  expect(result.overall).toBe(2);
  expect(result.studentWeighted).toBe(2);
  expect(result.peerWeighted).toBe(0);
  expect(result.hodWeighted).toBe(0);
});
