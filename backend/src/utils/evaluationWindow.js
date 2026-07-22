export function evaluationWindowError(assignment) {
  if (assignment.status !== 'PUBLISHED') return 'This instructor assignment is not published';
  const semester = assignment.semester;
  if (!semester || semester.status !== 'OPEN') return 'Evaluations are not open for this semester';
  const now = new Date();
  if (semester.evaluationOpensAt && now < semester.evaluationOpensAt) return 'The evaluation period has not opened yet';
  if (semester.evaluationClosesAt && now > semester.evaluationClosesAt) return 'The evaluation period has closed';
  return '';
}
