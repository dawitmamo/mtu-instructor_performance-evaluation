import { categoryScores, weightedOverall } from '../utils/score.js';

test('computes weighted evaluation score', () => {
  const result = weightedOverall({ student: [{ responses: [{ score: 4 }, { score: 5 }] }], peer: [{ responses: [{ score: 3 }, { score: 4 }] }], hod: [{ responses: [{ score: 5 }, { score: 5 }] }] });
  expect(result.overall).toBe(87);
  expect(result.studentWeighted).toBe(36);
  expect(result.peerWeighted).toBe(21);
  expect(result.hodWeighted).toBe(30);
});

test('ignores not applicable responses in scores', () => {
  const evaluations = [{ responses: [{ category: 'Core Competency', score: 5 }, { category: 'Core Competency', notApplicable: true }] }];
  expect(categoryScores(evaluations)).toEqual([{ category: 'Core Competency', score: 5 }]);
  expect(weightedOverall({ student: evaluations }).studentScore).toBe(5);
  expect(weightedOverall({ student: [{ responses: [{ category: 'Core Competency', notApplicable: true }] }] }).studentScore).toBe(0);
});

test('keeps missing evaluator groups at zero without changing the approved weights', () => {
  const result = weightedOverall({ student: [{ responses: [{ score: 5 }] }] });
  expect(result.overall).toBe(40);
  expect(result.studentWeighted).toBe(40);
  expect(result.peerWeighted).toBe(0);
  expect(result.hodWeighted).toBe(0);
});

test('uses metric values as relative weights and preserves a default value of one', () => {
  const weighted = [{ responses: [
    { category: 'Teaching', score: 5, value: 3 },
    { category: 'Teaching', score: 1, value: 1 }
  ] }];
  expect(weightedOverall({ hod: weighted }).hodScore).toBe(4);
  expect(categoryScores(weighted)).toEqual([{ category: 'Teaching', score: 4 }]);

  const legacy = [{ responses: [{ category: 'Teaching', score: 5 }, { category: 'Teaching', score: 3 }] }];
  expect(weightedOverall({ hod: legacy }).hodScore).toBe(4);
});
