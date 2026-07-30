import { useEffect, useMemo, useState } from 'react';
import { Download, Send } from 'lucide-react';
import { downloadReport, getAssignments, getInstructorReport, publishInstructorReport } from '../api/client.js';

export function ReportsPage({ user }) {
  const committeeMember = (user.committeeRoles || []).includes('COURSE_EXAM_COMMITTEE');
  const selfOnly = user.role === 'INSTRUCTOR' && !committeeMember;
  const [assignments, setAssignments] = useState([]);
  const [instructorId, setInstructorId] = useState(selfOnly ? user.id : '');
  const [semesterId, setSemesterId] = useState('');
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
    getInstructorReport(instructorId, semesterId).then((loadedReport) => {
      setReport(loadedReport);
      setSemesterId((current) => current || loadedReport.semester?._id || '');
      setFinalSummary(loadedReport.report?.finalSummary || '');
    }).catch((requestError) => setError(requestError.response?.data?.message || 'Report could not be loaded.'));
  }, [instructorId, semesterId]);

  const instructors = useMemo(() => [...new Map(assignments.filter((row) => row.instructor).map((row) => [row.instructor._id, row.instructor])).values()], [assignments]);
  const download = async (format) => { setError(''); try { await downloadReport(instructorId, format, semesterId); } catch (requestError) { setError(requestError.response?.data?.message || 'Report could not be downloaded.'); } };
  const publish = async () => {
    setError(''); setMessage('');
    try {
      const result = await publishInstructorReport(instructorId, finalSummary, semesterId);
      setReport((current) => ({ ...current, report: result.report }));
      setMessage(result.message);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Final summary could not be published.');
    }
  };
  return <section className='panel data-page'>
    <div className='panel-title'><div><h2>{selfOnly ? 'My Evaluation Report' : 'Reports'}</h2><p>{selfOnly ? 'View and download your own instructor evaluation summary.' : 'Review department instructors and publish final evaluation summaries.'}</p></div><Download size={22} /></div>
    {!selfOnly && <label className='report-select'><span>Instructor</span><select value={instructorId} onChange={(event) => { setSemesterId(''); setReport(null); setInstructorId(event.target.value); }}>{instructors.map((item) => <option value={item._id} key={item._id}>{item.firstName} {item.lastName}</option>)}</select></label>}
    {report?.availableSemesters?.length > 0 && <label className='report-select'><span>Semester</span><select value={semesterId} onChange={(event) => setSemesterId(event.target.value)}>{report.availableSemesters.map((item) => <option value={item._id} key={item._id}>{item.name} {item.academicYear}</option>)}</select></label>}
    {report && <div className='report-summary'>
      <div><small>Instructor</small><strong>{report.instructor?.firstName} {report.instructor?.lastName}</strong></div>
      <div><small>Course(s)</small><strong>{report.courseResults?.map((item) => `${item.courseCode} - ${item.courseTitle}`).join(', ') || 'No assigned course'}</strong></div>
      <div><small>Final result</small><strong>{report.scores?.overall} / 5</strong></div>
      <div><small>Student 40% ({report.evaluationCounts?.student || 0} submitted)</small><strong>{report.scores?.studentScore} × 40% = {report.scores?.studentWeighted}</strong></div>
      <div><small>Peer 30% ({report.evaluationCounts?.peer || 0} submitted)</small><strong>{report.scores?.peerScore} × 30% = {report.scores?.peerWeighted}</strong></div>
      <div><small>HOD 30% ({report.evaluationCounts?.hod || 0} submitted)</small><strong>{report.scores?.hodScore} × 30% = {report.scores?.hodWeighted}</strong></div>
      <div><small>Semester</small><strong>{report.semester ? `${report.semester.name} ${report.semester.academicYear}` : 'All semesters'}</strong></div>
    </div>}
    {report && report.evaluationCounts?.total === 0 && <div className='error-message'>No submitted evaluations were found for this instructor in the selected semester.</div>}
    {report?.courseResults?.length > 0 && <div className='key-results'><p>Results by course</p>{report.courseResults.map((item) => <div key={item.assignment}><strong>{item.courseCode} - {item.courseTitle}</strong><code>{item.finalScore} / 5</code></div>)}</div>}
    {report?.report?.categoryScores?.length > 0 && <div className='key-results'><p>Category scores</p>{report.report.categoryScores.map((item) => <div key={item.category}><strong>{item.category}</strong><code>{item.score}</code></div>)}</div>}
    {report?.report?.recommendations?.length > 0 && <div className='key-results'><p>Recommendations</p>{report.report.recommendations.map((item) => <div key={item}><span>{item}</span></div>)}</div>}
    {(user.role === 'HOD' || committeeMember) && !selfOnly && <div className='final-summary-editor'>
      <label><span>Final summary for the instructor</span><textarea value={finalSummary} onChange={(event) => setFinalSummary(event.target.value)} minLength={10} maxLength={4000} rows={5} placeholder='Summarize the final decision, strengths, required improvements, and follow-up actions.' /></label>
      <button className='primary-action' type='button' disabled={!instructorId || finalSummary.trim().length < 10} onClick={publish}><Send size={17} /> Publish to instructor</button>
    </div>}
    {message && <div className='success-message'>{message}</div>}
    <div className='summary-actions'><button disabled={!instructorId} onClick={() => download('pdf')}>Download PDF</button><button disabled={!instructorId} onClick={() => download('csv')}>Download CSV</button></div>
    {error && <div className='error-message'>{error}</div>}
  </section>;
}
