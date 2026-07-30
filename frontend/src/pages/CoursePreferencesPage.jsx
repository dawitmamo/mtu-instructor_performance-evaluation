import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ClipboardList, RotateCcw, Save, Send, UserCheck } from 'lucide-react';
import { finalizeCoursePreference, getCoursePreferenceManagement, getInstructorCoursePreferences, getSemesters, recommendCoursePreference, resetCourseAllocations, submitCoursePreference } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

function idOf(value) {
  return value?._id || value || '';
}

function courseLabel(course) {
  return course ? `${course.code} - ${course.title}` : '';
}

function requestMessage(error, fallback) {
  return error.response?.data?.message || fallback;
}

function InstructorCoursePreferences() {
  const [data, setData] = useState(null);
  const [semesterId, setSemesterId] = useState('');
  const [choices, setChoices] = useState(['', '', '']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const result = await getInstructorCoursePreferences();
      setData(result);
      setSemesterId((current) => current || idOf(result.courses.find((course) => !['CLOSED', 'ARCHIVED'].includes(course.semester?.status))?.semester) || idOf(result.courses[0]?.semester));
    } catch (requestError) {
      setError(requestMessage(requestError, 'Course preferences could not be loaded.'));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const semesters = useMemo(() => {
    const unique = new Map();
    for (const course of data?.courses || []) {
      if (course.semester) unique.set(idOf(course.semester), course.semester);
    }
    return [...unique.values()].sort((first, second) => new Date(second.startsAt || 0) - new Date(first.startsAt || 0));
  }, [data]);
  const preference = useMemo(() => (data?.preferences || []).find((item) => idOf(item.semester) === semesterId), [data, semesterId]);
  const semesterCourses = useMemo(() => (data?.courses || []).filter((course) => idOf(course.semester) === semesterId), [data, semesterId]);
  const occupied = useMemo(() => new Set(data?.occupiedCourseIds || []), [data]);

  useEffect(() => {
    const saved = preference?.choices?.map(idOf) || [];
    setChoices([saved[0] || '', saved[1] || '', saved[2] || '']);
    setError(''); setMessage('');
  }, [preference, semesterId]);

  const selectedChoices = choices.filter(Boolean);
  const valid = selectedChoices.length >= 1 && selectedChoices.length <= 3 && new Set(selectedChoices).size === selectedChoices.length;
  const finalized = ['FINALIZED', 'CONFIRMED'].includes(preference?.status);
  const recommended = preference?.status === 'RECOMMENDED';
  const locked = finalized || recommended;
  const selectedSemester = semesters.find((semester) => idOf(semester) === semesterId);
  const canSubmit = valid && !locked && !['CLOSED', 'ARCHIVED'].includes(selectedSemester?.status);

  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const result = await submitCoursePreference({ semester: semesterId, choices: selectedChoices });
      setMessage(result.message || 'Your preferences were sent for review.');
      await load();
    } catch (requestError) {
      setError(requestMessage(requestError, 'Course preferences could not be submitted.'));
    } finally {
      setBusy(false);
    }
  };

  if (error && !data) return <div className='error-message'>{error}</div>;
  if (!data) return <div className='loading-state'>Loading course preferences...</div>;
  if (!semesters.length) return <section className='panel empty-state'><h2>No courses available</h2><p>Your department has not added semester courses yet.</p></section>;

  return <div className='course-preference-page'>
    <section className='panel'>
      <div className='panel-title'>
        <div><h2>Rank up to three courses</h2><p>Your choices go first to the Course and Exam Committee for recommendation, then to the HOD for final allocation.</p></div>
        <ClipboardList size={24} />
      </div>
      <label className='preference-semester'><span>Semester</span><select value={semesterId} onChange={(event) => setSemesterId(event.target.value)}>{semesters.map((semester) => <option value={idOf(semester)} key={idOf(semester)}>{semester.name} {semester.academicYear} - {semester.status}</option>)}</select></label>
      {finalized ? <div className='allocation-result'>
        <CheckCircle2 size={29} />
        <div><small>Finalized course</small><h2>{courseLabel(preference.confirmedCourse)}</h2><p>Finalized by HOD {preference.confirmedBy ? `${preference.confirmedBy.firstName} ${preference.confirmedBy.lastName}` : ''}. A notification has been sent to your dashboard.</p></div>
      </div> : recommended ? <div className='committee-recommendation'><strong>Committee recommendation: {courseLabel(preference.recommendedCourse)}</strong><span>{preference.committeeNote}</span><small>Awaiting the HOD’s final course allocation.</small></div> : <form className='course-preference-form' onSubmit={submit}>
        {choices.map((choice, index) => <label key={index}>
          <span>Preference {index + 1}{index > 0 ? ' (optional)' : ''}</span>
          <select value={choice} onChange={(event) => setChoices((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} required={index === 0}>
            <option value=''>Select course</option>
            {semesterCourses.map((course) => {
              const selectedElsewhere = choices.some((item, itemIndex) => itemIndex !== index && item === course._id);
              return <option value={course._id} key={course._id} disabled={selectedElsewhere}>{courseLabel(course)}</option>;
            })}
          </select>
        </label>)}
        <p className='form-guidance'>Preference 1 is your first choice. Submission time does not reserve a course: the Course and Exam Committee recommends by academic criteria, then the HOD makes the final allocation.</p>
        {error && <div className='error-message'>{error}</div>}
        {message && <div className='success-message'>{message}</div>}
        <button className='primary-action' disabled={!canSubmit || busy}><Send size={17} />{busy ? 'Sending...' : preference ? 'Update and resend' : 'Send preferences'}</button>
      </form>}
    </section>
    <section className='panel'>
      <div className='panel-title'><div><h2>Semester course catalog</h2><p>You may rank any course that has not already been finalized for another instructor.</p></div><span>{semesterCourses.filter((course) => !occupied.has(course._id)).length} open</span></div>
      <div className='preference-course-list'>{semesterCourses.map((course) => <div className={occupied.has(course._id) ? 'preference-course held' : 'preference-course'} key={course._id}><div><strong>{course.code}</strong><span>{course.title}</span></div><small>{course.creditHours} credit hours{course.academicStream ? ` · ${course.academicStream.replaceAll('_', ' ')}` : ''}</small><em>{occupied.has(course._id) ? 'Held' : 'Available'}</em></div>)}</div>
    </section>
  </div>;
}

function StaffCoursePreferences() {
  const { user } = useAuth();
  const isHod = user.role === 'HOD';
  const isCommittee = (user.committeeRoles || []).includes('COURSE_EXAM_COMMITTEE');
  const [semesters, setSemesters] = useState([]);
  const [semesterId, setSemesterId] = useState('');
  const [data, setData] = useState(null);
  const [selections, setSelections] = useState({});
  const [notes, setNotes] = useState({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    getSemesters().then((items) => {
      setSemesters(items);
      setSemesterId((current) => current || items[0]?._id || '');
    }).catch((requestError) => setError(requestMessage(requestError, 'Semesters could not be loaded.')));
  }, []);

  const load = useCallback(async () => {
    if (!semesterId) return;
    setError('');
    try {
      const result = await getCoursePreferenceManagement(semesterId);
      setData(result);
      setSelections(Object.fromEntries(result.preferences.map((preference) => {
        const firstAvailable = preference.choices.find((course) => !result.assignments.some((assignment) => idOf(assignment.course) === course._id && idOf(assignment.instructor) !== idOf(preference.instructor)));
        return [preference._id, idOf(preference.confirmedCourse) || idOf(preference.recommendedCourse) || firstAvailable?._id || ''];
      })));
      setNotes(Object.fromEntries(result.preferences.map((preference) => [preference._id, isHod ? preference.hodNote || '' : preference.committeeNote || ''])));
    } catch (requestError) {
      setError(requestMessage(requestError, 'Submitted course preferences could not be loaded.'));
    }
  }, [semesterId, isHod]);
  useEffect(() => { load(); }, [load]);

  const confirmedByCourse = useMemo(() => new Map((data?.preferences || []).filter((preference) => ['FINALIZED', 'CONFIRMED'].includes(preference.status)).map((preference) => [idOf(preference.confirmedCourse), idOf(preference.instructor)])), [data]);
  const assignedByCourse = useMemo(() => new Map((data?.assignments || []).map((assignment) => [idOf(assignment.course), idOf(assignment.instructor)])), [data]);
  const heldByOther = (courseId, instructorId) => {
    const assignmentOwner = assignedByCourse.get(courseId);
    const confirmedOwner = confirmedByCourse.get(courseId);
    return (assignmentOwner && assignmentOwner !== instructorId) || (confirmedOwner && confirmedOwner !== instructorId);
  };

  const decide = async (preference) => {
    const courseId = selections[preference._id];
    const note = (notes[preference._id] || '').trim();
    if (!courseId || note.length < 5) return;
    const action = isHod ? 'Finalize' : 'Recommend';
    if (!window.confirm(`${action} this course for ${preference.instructor.firstName} ${preference.instructor.lastName}?`)) return;
    setBusy(preference._id); setError(''); setMessage('');
    try {
      const result = isHod
        ? await finalizeCoursePreference(preference._id, courseId, note)
        : await recommendCoursePreference(preference._id, courseId, note);
      setMessage(result.message);
      await load();
    } catch (requestError) {
      setError(requestMessage(requestError, 'The course decision could not be saved.'));
    } finally {
      setBusy('');
    }
  };

  const reset = async () => {
    if (!semesterId || !window.confirm('Reset all course allocation decisions for this semester? Draft assignments created by finalization will be removed, but courses and evaluation history will be preserved.')) return;
    setBusy('reset'); setError(''); setMessage('');
    try {
      const result = await resetCourseAllocations(semesterId);
      setMessage(result.message);
      await load();
    } catch (requestError) {
      setError(requestMessage(requestError, 'Course allocations could not be reset.'));
    } finally {
      setBusy('');
    }
  };

  return <div className='course-preference-management'>
    <section className='panel'>
      <div className='panel-title'><div><h2>{isHod ? 'HOD final course allocation' : 'Committee course recommendation'}</h2><p>{isHod ? 'Review the committee recommendation and make the final course decision using documented criteria.' : 'Make the first recommendation from ranked preferences using academic criteria, not submission time.'}</p></div><UserCheck size={24} /></div>
      <label className='preference-semester'><span>Semester</span><select value={semesterId} onChange={(event) => { setSemesterId(event.target.value); setMessage(''); }}><option value=''>Select semester</option>{semesters.map((semester) => <option value={semester._id} key={semester._id}>{semester.name} {semester.academicYear} - {semester.status}</option>)}</select></label>
      {isHod && <button type='button' className='secondary-action allocation-reset' onClick={reset} disabled={!semesterId || Boolean(busy)}><RotateCcw size={17} />{busy === 'reset' ? 'Resetting...' : 'Reset semester allocations'}</button>}
      {error && <div className='error-message'>{error}</div>}
      {message && <div className='success-message'>{message}</div>}
    </section>
    <section className='panel'>
      <div className='panel-title'><div><h2>Submitted preferences</h2><p>{isHod ? 'Finalization creates a draft assignment and notifies the instructor.' : 'Recommendations go to the HOD and do not reserve courses.'}</p></div><span>{data?.preferences?.length || 0} submissions</span></div>
      {!data ? <div className='loading-state'>Loading submitted preferences...</div> : !data.preferences.length ? <div className='empty-state'>No instructors have submitted preferences for this semester.</div> : <div className='course-preference-review-list'>{data.preferences.map((preference) => {
        const instructorId = idOf(preference.instructor);
        const finalized = ['FINALIZED', 'CONFIRMED'].includes(preference.status);
        const canDecide = isCommittee ? !finalized : isHod && preference.status === 'RECOMMENDED';
        return <article className='course-preference-review-card' key={preference._id}>
          <div className='preference-review-heading'><div><strong>{preference.instructor.firstName} {preference.instructor.lastName}</strong><small>{preference.instructor.employeeNumber || preference.instructor.email}</small></div><em className={finalized ? 'confirmed' : ''}>{preference.status}</em></div>
          <ol>{preference.choices.map((course) => <li key={course._id}><span>{courseLabel(course)}</span><small>{heldByOther(course._id, instructorId) ? 'Finalized for another instructor' : 'Available for decision'}</small></li>)}</ol>
          {preference.recommendedCourse && <div className='committee-recommendation'><strong>Committee recommendation: {courseLabel(preference.recommendedCourse)}</strong><span>{preference.committeeNote}</span><small>By {preference.recommendedBy ? `${preference.recommendedBy.firstName} ${preference.recommendedBy.lastName}` : 'Course and Exam Committee'}</small></div>}
          {finalized ? <div className='confirmed-course'><CheckCircle2 size={18} /><span>HOD finalized: <strong>{courseLabel(preference.confirmedCourse)}</strong>{preference.hodNote ? ` — ${preference.hodNote}` : ''}</span></div> : canDecide ? <div className='preference-decision-form'>
            <label><span>{isHod ? 'Final course' : 'Recommended course'}</span><select value={selections[preference._id] || ''} onChange={(event) => setSelections((current) => ({ ...current, [preference._id]: event.target.value }))}><option value=''>Select from submitted choices</option>{preference.choices.map((course) => <option value={course._id} key={course._id} disabled={heldByOther(course._id, instructorId)}>{courseLabel(course)}{heldByOther(course._id, instructorId) ? ' (already finalized)' : ''}</option>)}</select></label>
            <label><span>Decision criteria / reason</span><textarea rows={2} minLength={5} maxLength={1000} value={notes[preference._id] || ''} onChange={(event) => setNotes((current) => ({ ...current, [preference._id]: event.target.value }))} placeholder='Experience, specialization, teaching load, prior performance, or department need' /></label>
            <button type='button' className='primary-action' onClick={() => decide(preference)} disabled={Boolean(busy) || !selections[preference._id] || (notes[preference._id] || '').trim().length < 5}><Save size={17} />{busy === preference._id ? 'Saving...' : isHod ? 'Finalize and notify' : preference.status === 'RECOMMENDED' ? 'Update recommendation' : 'Recommend to HOD'}</button>
          </div> : isHod && <div className='empty-state compact'>Awaiting the Course and Exam Committee’s recommendation.</div>}
        </article>;
      })}</div>}
    </section>
  </div>;
}

export function CoursePreferencesPage() {
  const { user } = useAuth();
  if (user.role === 'HOD') return <StaffCoursePreferences />;
  if ((user.committeeRoles || []).includes('COURSE_EXAM_COMMITTEE')) {
    return <div className='course-preference-dual'><InstructorCoursePreferences /><StaffCoursePreferences /></div>;
  }
  return <InstructorCoursePreferences />;
}
