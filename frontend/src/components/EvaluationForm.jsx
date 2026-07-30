import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Send } from 'lucide-react';
import { getEvaluationTargets, getEvaluationTemplate, submitHodEvaluation, submitPeerEvaluation, submitStudentEvaluation } from '../api/client.js';

function templateRows(template) {
  return (template?.categories || []).flatMap((category) =>
    category.questions
      .slice()
      .sort((first, second) => first.order - second.order)
      .map((question) => ({ category: category.name, question: question.text }))
  );
}

function isAnswered(answer) {
  return Boolean(answer?.notApplicable || typeof answer?.score === 'number');
}

function buildResponses(rows, answers) {
  return rows.map((row, index) => ({ ...row, ...answers[index] }));
}

function completionFor(rows, answers) {
  if (!rows.length) return 0;
  return Math.round((rows.filter((_, index) => isAnswered(answers[index])).length / rows.length) * 100);
}

function QuestionList({ rows, scale, answers, setAnswers }) {
  const options = scale?.options?.length ? scale.options : [1, 2, 3, 4, 5].map((value) => ({ value, label: String(value), description: String(value) }));
  return <div className='question-list'>{rows.map((row, index) => {
    const answer = answers[index] || {};
    return <div className='question-row' key={row.category + row.question}>
      <div><strong>{row.question}</strong><span>{row.category}</span></div>
      <div className='likert scale-row'>{options.map((option) =>
        <button type='button' title={option.description} className={answer.score === option.value ? 'selected' : ''} onClick={() => setAnswers({ ...answers, [index]: { score: option.value, notApplicable: false } })} key={option.value}>{option.label}</button>
      )}{scale?.allowNotApplicable && <button type='button' title='Not applicable' className={answer.notApplicable ? 'selected muted' : 'muted'} onClick={() => setAnswers({ ...answers, [index]: { notApplicable: true } })}>{scale.notApplicableLabel || 'NA'}</button>}</div>
    </div>;
  })}</div>;
}

export function EvaluationForm({ courses, onSubmitted }) {
  const [template, setTemplate] = useState(null);
  const [assignment, setAssignment] = useState(courses.find((item) => !item.submitted)?.assignmentId || '');
  const [comment, setComment] = useState('');
  const [answers, setAnswers] = useState({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { getEvaluationTemplate('STUDENT').then(setTemplate).catch((requestError) => setError(requestError.response?.data?.message || 'Evaluation template could not be loaded.')); }, []);
  useEffect(() => { if (!assignment) setAssignment(courses.find((item) => !item.submitted)?.assignmentId || ''); }, [assignment, courses]);

  const rows = useMemo(() => templateRows(template), [template]);
  const completion = completionFor(rows, answers);

  const submit = async (event) => {
    event.preventDefault(); setError('');
    if (rows.some((_, index) => !isAnswered(answers[index]))) { setError('Please score every question or mark it NA.'); return; }
    try {
      const result = await submitStudentEvaluation({ assignment, template: template?._id, responses: buildResponses(rows, answers), anonymousComment: comment });
      const nextAssignment = courses.find((item) => !item.submitted && item.assignmentId !== assignment)?.assignmentId || '';
      setMessage(result.message);
      setAssignment(nextAssignment);
      setComment('');
      setAnswers({});
      await onSubmitted?.();
    } catch (requestError) { setError(requestError.response?.data?.message || 'Evaluation could not be submitted.'); }
  };

  if (!courses.length) return <section className='panel empty-state'><h2>No assigned courses</h2><p>Your published courses will appear here.</p></section>;
  return <section className='panel evaluation-panel'>
    <div className='panel-title'><div><h2>{template?.name || 'Evaluation Form'}</h2><p className='template-meta'>{template?.description}</p></div><span>{completion}% complete</span></div>
    {message && <div className='submitted-state'><CheckCircle2 size={36} /><strong>{message}</strong><span>Responses are locked after submission.</span></div>}
    {assignment ?
      <form onSubmit={submit}>
        <label><span>Instructor and course</span><select value={assignment} onChange={(event) => { setAssignment(event.target.value); setComment(''); setAnswers({}); setMessage(''); setError(''); }} required>{courses.map((item) => <option value={item.assignmentId} key={item.assignmentId} disabled={item.submitted}>{item.instructor?.firstName} {item.instructor?.lastName} - {item.course.code}: {item.course.title}{item.submitted ? ' (submitted)' : ''}</option>)}</select></label>
        <label><span>Anonymous comment</span><textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder='Optional comment' rows={3} /></label>
        {error && <div className='error-message'>{error}</div>}
        <QuestionList rows={rows} scale={template?.scale} answers={answers} setAnswers={setAnswers} />
        <button className='primary-action' type='submit' disabled={!rows.length || !assignment}><Send size={18} /> Submit once</button>
      </form>
      : <div className='empty-state'>All available course evaluations are complete.</div>}
  </section>;
}

export function StaffEvaluationForm({ kind, title, onSubmitted }) {
  const [template, setTemplate] = useState(null);
  const [targets, setTargets] = useState([]);
  const [targetId, setTargetId] = useState('');
  const [comment, setComment] = useState('');
  const [answers, setAnswers] = useState({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([getEvaluationTemplate(kind), getEvaluationTargets(kind)])
      .then(([loadedTemplate, loadedTargets]) => {
        setTemplate(loadedTemplate);
        setTargets(loadedTargets);
        setTargetId(loadedTargets[0]?._id || '');
      })
      .catch((requestError) => setError(requestError.response?.data?.message || 'Evaluation data could not be loaded.'));
  }, [kind]);

  const rows = useMemo(() => templateRows(template), [template]);
  const selectedTarget = targets.find((target) => target._id === targetId);
  const completion = completionFor(rows, answers);

  const submit = async (event) => {
    event.preventDefault(); setError('');
    if (!selectedTarget) { setError('Select an instructor to evaluate.'); return; }
    if (rows.some((_, index) => !isAnswered(answers[index]))) { setError('Please score every question or mark it NA.'); return; }
    const payload = {
      assignment: selectedTarget._id,
      template: template?._id,
      responses: buildResponses(rows, answers),
      anonymousComment: comment
    };
    try {
      const result = kind === 'HOD' ? await submitHodEvaluation(payload) : await submitPeerEvaluation(payload);
      const remainingTargets = targets.filter((target) => target._id !== selectedTarget._id);
      setMessage(result.message);
      setTargets(remainingTargets);
      setTargetId(remainingTargets[0]?._id || '');
      setComment('');
      setAnswers({});
      await onSubmitted?.();
    } catch (requestError) { setError(requestError.response?.data?.message || 'Evaluation could not be submitted.'); }
  };

  return <section className='panel evaluation-panel staff-evaluation-panel'>
    <div className='panel-title'><div><h2>{title || template?.name || 'Staff Evaluation'}</h2><p className='template-meta'>{template?.description}</p></div><span>{completion}% complete</span></div>
    {message && <div className='submitted-state'><CheckCircle2 size={36} /><strong>{message}</strong><span>Responses are locked after submission.</span></div>}
    {targets.length ?
      <form onSubmit={submit}>
        <label><span>Instructor and course</span><select value={targetId} onChange={(event) => { setTargetId(event.target.value); setComment(''); setAnswers({}); setMessage(''); setError(''); }} required disabled={!targets.length}>{targets.map((target) => <option value={target._id} key={target._id}>{target.instructor?.firstName} {target.instructor?.lastName} - {target.course?.code}: {target.course?.title} ({target.semester?.name})</option>)}</select></label>
        {!targets.length && !error && <div className='empty-state'>No published evaluation targets are available.</div>}
        <label><span>Comment</span><textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder='Optional comment' rows={3} /></label>
        {error && <div className='error-message'>{error}</div>}
        <QuestionList rows={rows} scale={template?.scale} answers={answers} setAnswers={setAnswers} />
        <button className='primary-action' type='submit' disabled={!rows.length || !targets.length}><Send size={18} /> Submit once</button>
      </form>
      : <div className='empty-state'>No published evaluation targets are available.</div>}
  </section>;
}
