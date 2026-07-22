import { useEffect, useMemo, useState } from 'react';
import { Download, KeyRound, Send } from 'lucide-react';
import { downloadReport, generateKeys, getAssignments, getInstructorReport, publishInstructorReport } from '../api/client.js';

export function EvaluationKeysPage() {
  const [assignments, setAssignments] = useState([]);
  const [assignment, setAssignment] = useState('');
  const minimumExpiry = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const [expiresAt, setExpiresAt] = useState('');
  const [keys, setKeys] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => { getAssignments().then((rows) => { setAssignments(rows); setAssignment(rows[0]?._id || ''); }).catch((requestError) => setError(requestError.response?.data?.message || 'Assignments could not be loaded.')); }, []);
  const submit = async (event) => {
    event.preventDefault(); setError('');
    try { setKeys(await generateKeys({ assignment, expiresAt: new Date(expiresAt).toISOString() })); }
    catch (requestError) { setError(requestError.response?.data?.message || 'Keys could not be generated.'); }
  };
  return <section className='panel data-page'>
    <div className='panel-title'><div><h2>Evaluation Keys</h2><p>Generate one-time keys for enrolled students.</p></div><KeyRound size={22} /></div>
    <form className='inline-form' onSubmit={submit}>
      <label><span>Assignment</span><select value={assignment} onChange={(event) => setAssignment(event.target.value)} required>{assignments.map((item) => <option value={item._id} key={item._id}>{item.course?.code} - {item.instructor?.firstName} {item.instructor?.lastName}</option>)}</select></label>
      <label><span>Expires</span><input type='date' min={minimumExpiry} value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} required /></label>
      <button className='primary-action' disabled={!assignment}>Generate keys</button>
    </form>
    {error && <div className='error-message'>{error}</div>}
    {keys.length > 0 && <div className='key-results'><p>Copy these keys now; only their hashes are stored.</p>{keys.map((item) => <div key={item.student}><strong>{item.student}</strong><code>{item.key}</code></div>)}</div>}
  </section>;
}

export function ReportsPage({ user }) {
  const committeeMember = user.role === 'EXAM_COMMITTEE' || Boolean(user.committeeRoles?.length);
  const selfOnly = user.role === 'INSTRUCTOR' && !committeeMember;
  const [assignments, setAssignments] = useState([]);
  const [instructorId, setInstructorId] = useState(selfOnly ? user.id : '');
  const [report, setReport] = useState(null);
  const [finalSummary, setFinalSummary] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (selfOnly) return;
    getAssignments().then((rows) => { setAssignments(rows); setInstructorId(rows[0]?.instructor?._id || ''); }).catch((requestError) => setError(requestError.response?.data?.message || 'Instructors could not be loaded.'));
  }, [selfOnly]);

  useEffect(() => {
    if (!instructorId) return;
    setError('');
    getInstructorReport(instructorId).then((loadedReport) => {
      setReport(loadedReport);
      setFinalSummary(loadedReport.report?.finalSummary || '');
    }).catch((requestError) => setError(requestError.response?.data?.message || 'Report could not be loaded.'));
  }, [instructorId]);

  const instructors = useMemo(() => [...new Map(assignments.filter((row) => row.instructor).map((row) => [row.instructor._id, row.instructor])).values()], [assignments]);
  const download = async (format) => { setError(''); try { await downloadReport(instructorId, format); } catch (requestError) { setError(requestError.response?.data?.message || 'Report could not be downloaded.'); } };
  const publish = async () => {
    setError(''); setMessage('');
    try {
      const result = await publishInstructorReport(instructorId, finalSummary);
      setReport((current) => ({ ...current, report: result.report }));
      setMessage(result.message);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Final summary could not be published.');
    }
  };
  return <section className='panel data-page'>
    <div className='panel-title'><div><h2>{selfOnly ? 'My Evaluation Report' : 'Reports'}</h2><p>{selfOnly ? 'View and download your own instructor evaluation summary.' : 'Review department instructors and publish final evaluation summaries.'}</p></div><Download size={22} /></div>
    {!selfOnly && <label className='report-select'><span>Instructor</span><select value={instructorId} onChange={(event) => setInstructorId(event.target.value)}>{instructors.map((item) => <option value={item._id} key={item._id}>{item.firstName} {item.lastName}</option>)}</select></label>}
    {report && <div className='report-summary'>
      <div><small>Instructor</small><strong>{report.instructor?.firstName} {report.instructor?.lastName}</strong></div>
      <div><small>Overall</small><strong>{report.scores?.overall}</strong></div>
      <div><small>Student</small><strong>{report.scores?.studentScore}</strong></div>
      <div><small>Peer</small><strong>{report.scores?.peerScore}</strong></div>
      <div><small>HOD</small><strong>{report.scores?.hodScore}</strong></div>
      <div><small>Semester</small><strong>{report.semester ? `${report.semester.name} ${report.semester.academicYear}` : 'All semesters'}</strong></div>
    </div>}
    {report?.report?.categoryScores?.length > 0 && <div className='key-results'><p>Category scores</p>{report.report.categoryScores.map((item) => <div key={item.category}><strong>{item.category}</strong><code>{item.score}</code></div>)}</div>}
    {report?.report?.recommendations?.length > 0 && <div className='key-results'><p>Recommendations</p>{report.report.recommendations.map((item) => <div key={item}><span>{item}</span></div>)}</div>}
    {(['HOD', 'EXAM_COMMITTEE'].includes(user.role) || committeeMember) && !selfOnly && <div className='final-summary-editor'>
      <label><span>Final summary for the instructor</span><textarea value={finalSummary} onChange={(event) => setFinalSummary(event.target.value)} minLength={10} maxLength={4000} rows={5} placeholder='Summarize the final decision, strengths, required improvements, and follow-up actions.' /></label>
      <button className='primary-action' type='button' disabled={!instructorId || finalSummary.trim().length < 10} onClick={publish}><Send size={17} /> Publish to instructor</button>
    </div>}
    {message && <div className='success-message'>{message}</div>}
    <div className='summary-actions'><button disabled={!instructorId} onClick={() => download('pdf')}>Download PDF</button><button disabled={!instructorId} onClick={() => download('csv')}>Download CSV</button></div>
    {error && <div className='error-message'>{error}</div>}
  </section>;
}
