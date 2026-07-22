import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Download, FileText, Upload } from 'lucide-react';
import { createSchedule, downloadScheduleFile, getDepartments, getSchedules, getSemesters } from '../api/client.js';

function idOf(value) {
  return value?._id || value || '';
}

function canManage(user) {
  return ['SUPER_ADMIN', 'HOD', 'EXAM_COMMITTEE'].includes(user.role)
    || (user.committeeRoles || []).some((role) => ['COURSE_COMMITTEE', 'EXAM_COMMITTEE'].includes(role));
}

const typeLabels = { CLASS: 'Class schedule', EXAM: 'Exam schedule', COMBINED: 'Class and exam schedule' };

export function SchedulesPage({ user }) {
  const manager = canManage(user);
  const [schedules, setSchedules] = useState([]);
  const [semesters, setSemesters] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [values, setValues] = useState({ title: '', description: '', scheduleType: 'CLASS', semester: '', department: idOf(user.department), status: 'PUBLISHED' });
  const [file, setFile] = useState(null);
  const [fileKey, setFileKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = async () => {
    const [loadedSchedules, loadedSemesters, loadedDepartments] = await Promise.all([getSchedules(), getSemesters(), getDepartments()]);
    setSchedules(loadedSchedules);
    setSemesters(loadedSemesters);
    setDepartments(loadedDepartments);
    setValues((current) => ({
      ...current,
      semester: current.semester || loadedSemesters[0]?._id || '',
      department: current.department || idOf(user.department) || loadedDepartments[0]?._id || ''
    }));
  };

  useEffect(() => { load().catch((requestError) => setError(requestError.response?.data?.message || 'Schedules could not be loaded.')); }, []);

  const visibleGroups = useMemo(() => {
    const groups = new Map();
    for (const schedule of schedules) {
      const key = `${schedule.semester?.name || 'Semester'} ${schedule.semester?.academicYear || ''}`.trim();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(schedule);
    }
    return [...groups.entries()];
  }, [schedules]);

  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      await createSchedule(values, file);
      setMessage(values.status === 'PUBLISHED' ? 'Schedule published to department students and instructors.' : 'Schedule draft saved for department managers.');
      setValues((current) => ({ ...current, title: '', description: '' }));
      setFile(null); setFileKey((current) => current + 1);
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Schedule could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const download = async (schedule) => {
    setError('');
    try { await downloadScheduleFile(schedule._id, schedule.fileName); }
    catch (requestError) { setError(requestError.response?.data?.message || 'Schedule file could not be downloaded.'); }
  };

  return <div className='schedule-page'>
    {manager && <section className='panel schedule-editor'>
      <div className='panel-title'><div><h2><Upload size={20} /> Prepare or upload a schedule</h2><p>Publish class or exam schedules to every student and instructor in the selected department.</p></div><span>PDF/CSV up to 5 MB</span></div>
      <form className='schedule-form' onSubmit={submit}>
        <label><span>Schedule title</span><input value={values.title} onChange={(event) => setValues({ ...values, title: event.target.value })} minLength={3} maxLength={150} placeholder='Second semester final exam schedule' required /></label>
        <label><span>Schedule type</span><select value={values.scheduleType} onChange={(event) => setValues({ ...values, scheduleType: event.target.value })}><option value='CLASS'>Class schedule</option><option value='EXAM'>Exam schedule</option><option value='COMBINED'>Class and exam schedule</option></select></label>
        <label><span>Semester</span><select value={values.semester} onChange={(event) => setValues({ ...values, semester: event.target.value })} required><option value=''>Select semester</option>{semesters.map((semester) => <option value={semester._id} key={semester._id}>{semester.name} {semester.academicYear}</option>)}</select></label>
        <label><span>Department</span><select value={values.department} onChange={(event) => setValues({ ...values, department: event.target.value })} disabled={user.role !== 'SUPER_ADMIN'} required><option value=''>Select department</option>{departments.map((department) => <option value={department._id} key={department._id}>{department.name}</option>)}</select></label>
        <label><span>Publication status</span><select value={values.status} onChange={(event) => setValues({ ...values, status: event.target.value })}><option value='PUBLISHED'>Publish now</option><option value='DRAFT'>Save as draft</option></select></label>
        <label className='schedule-file'><span>Attach schedule file</span><input key={fileKey} type='file' accept='.pdf,.csv,application/pdf,text/csv' onChange={(event) => setFile(event.target.files?.[0] || null)} /></label>
        <label className='schedule-description'><span>Schedule details</span><textarea value={values.description} onChange={(event) => setValues({ ...values, description: event.target.value })} maxLength={5000} rows={6} placeholder='Enter dates, times, course/class, venue, and instructions. This may be used instead of an attachment.' /></label>
        <button className='primary-action' disabled={busy || !values.department || !values.semester || (!file && !values.description.trim())}><Upload size={17} />{busy ? 'Saving...' : values.status === 'PUBLISHED' ? 'Publish schedule' : 'Save draft'}</button>
      </form>
      {message && <div className='success-message'>{message}</div>}
      {error && <div className='error-message'>{error}</div>}
    </section>}

    <section className='panel data-page schedule-library'>
      <div className='panel-title'><div><h2><CalendarClock size={20} /> Department schedules</h2><p>{manager ? 'Published schedules and manager-only drafts.' : 'Published class and exam schedules for your department.'}</p></div><span>{schedules.length} schedules</span></div>
      {!schedules.length ? <div className='empty-state'>No schedule has been published for your department yet.</div> : <div className='schedule-groups'>{visibleGroups.map(([semester, records]) => <section key={semester} className='schedule-group'>
        <h3>{semester}</h3>
        <div className='schedule-grid'>{records.map((schedule) => <article className='schedule-card' key={schedule._id}>
          <div className='schedule-card-heading'><FileText size={22} /><div><strong>{schedule.title}</strong><span>{typeLabels[schedule.scheduleType]} / {schedule.department?.name}</span></div><em className={schedule.status === 'PUBLISHED' ? 'published' : ''}>{schedule.status}</em></div>
          {schedule.description && <p>{schedule.description}</p>}
          <small>Prepared by {schedule.uploadedBy ? `${schedule.uploadedBy.firstName} ${schedule.uploadedBy.lastName}` : 'the department'} on {new Date(schedule.createdAt).toLocaleDateString()}</small>
          {schedule.fileName && <button type='button' className='secondary-action schedule-download' onClick={() => download(schedule)}><Download size={16} /> Download {schedule.fileName}</button>}
        </article>)}</div>
      </section>)}</div>}
      {!manager && error && <div className='error-message'>{error}</div>}
    </section>
  </div>;
}
