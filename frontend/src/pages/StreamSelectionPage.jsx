import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ListOrdered, PlayCircle, Save, Users } from 'lucide-react';
import { allocateStreamSelection, getSemesters, getStreamSelectionManagement, getStudentStreamSelection, saveStreamSelectionRound, submitStreamPreferences } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { academicStreams, streamLabel } from '../utils/academicStreams.js';

function idOf(value) {
  return value?._id || value || '';
}

function requestMessage(error, fallback) {
  return error.response?.data?.message || fallback;
}

function CapacityCards({ capacities, onChange, disabled }) {
  return <div className='capacity-grid'>
    {academicStreams.map(([stream, label]) => <label key={stream}>
      <span>{label}</span>
      <input type='number' min='0' step='1' value={capacities[stream] ?? 0} disabled={disabled} onChange={(event) => onChange(stream, event.target.value)} required />
      <small>Available seats</small>
    </label>)}
  </div>;
}

function StudentStreamSelection() {
  const [data, setData] = useState(null);
  const [choices, setChoices] = useState(['', '', '']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const result = await getStudentStreamSelection();
      setData(result);
      setChoices(result.preference?.choices?.length === 3 ? result.preference.choices : ['', '', '']);
    } catch (requestError) {
      setError(requestMessage(requestError, 'Stream selection could not be loaded.'));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const setChoice = (index, value) => setChoices((current) => current.map((choice, choiceIndex) => choiceIndex === index ? value : choice));
  const validChoices = choices.every(Boolean) && new Set(choices).size === 3;
  const canSubmit = data?.round?.status === 'OPEN' && validChoices;
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true); setError(''); setMessage('');
    try {
      const preference = await submitStreamPreferences({ round: data.round._id, choices });
      setData((current) => ({ ...current, preference }));
      setMessage('Your three ranked stream choices were saved.');
    } catch (requestError) {
      setError(requestMessage(requestError, 'Preferences could not be saved.'));
    } finally {
      setBusy(false);
    }
  };

  if (error && !data) return <div className='error-message'>{error}</div>;
  if (!data) return <div className='loading-state'>Loading stream selection...</div>;
  if (!data.eligible) return <section className='panel empty-state'><h2>Stream selection eligibility</h2><p>{data.reason}</p></section>;
  if (!data.round) return <section className='panel empty-state'><h2>No selection round yet</h2><p>Your HOD or Exam Committee has not prepared the second-semester stream selection round.</p></section>;

  const allocated = data.preference?.status === 'ALLOCATED';
  return <div className='stream-selection-layout'>
    <section className='panel stream-intro'>
      <div className='panel-title'>
        <div><h2>Choose three streams in order</h2><p>{data.round.semester?.name} {data.round.semester?.academicYear}</p></div>
        <span className={`round-status status-${data.round.status.toLowerCase()}`}>{data.round.status}</span>
      </div>
      <div className='selection-facts'>
        <div><small>Your verified GPA</small><strong>{typeof data.gpa === 'number' ? data.gpa.toFixed(2) : 'Not entered'}</strong></div>
        <div><small>Eligible class</small><strong>Year 3, Semester 2</strong></div>
        <div><small>Choices required</small><strong>3 of 4 streams</strong></div>
      </div>
      {allocated ? <div className='allocation-result'>
        <CheckCircle2 size={28} />
        <div><small>Your assigned stream</small><h2>{streamLabel(data.preference.allocatedStream)}</h2><p>{data.preference.allocationRank <= 3 ? `Allocated from choice ${data.preference.allocationRank}` : 'Your ranked choices were full, so the available fourth stream was assigned.'}</p></div>
      </div> : <form className='preference-form' onSubmit={submit}>
        {choices.map((choice, index) => <label key={index}>
          <span>Choice {index + 1}</span>
          <select value={choice} onChange={(event) => setChoice(index, event.target.value)} disabled={data.round.status !== 'OPEN'} required>
            <option value=''>Select stream</option>
            {academicStreams.map(([stream, label]) => <option value={stream} key={stream} disabled={choices.some((selected, selectedIndex) => selectedIndex !== index && selected === stream)}>{label}</option>)}
          </select>
        </label>)}
        <p className='form-guidance'>Allocation is processed from the highest GPA downward. Each student receives the highest-ranked choice that still has capacity.</p>
        {error && <div className='error-message'>{error}</div>}
        {message && <div className='success-message'>{message}</div>}
        <button className='primary-action' disabled={!canSubmit || busy}><Save size={17} />{busy ? 'Saving...' : data.preference ? 'Update choices' : 'Submit choices'}</button>
      </form>}
    </section>
    <section className='panel'>
      <div className='panel-title'><div><h2>Stream capacities</h2><p>Seat limits set by the department.</p></div><ListOrdered size={22} /></div>
      <div className='capacity-summary'>{data.round.capacities.map((item) => <div key={item.academicStream}><span>{streamLabel(item.academicStream)}</span><strong>{item.seats} seats</strong></div>)}</div>
    </section>
  </div>;
}

function StaffStreamSelection() {
  const [data, setData] = useState(null);
  const [semesters, setSemesters] = useState([]);
  const [selectedRoundId, setSelectedRoundId] = useState('');
  const [values, setValues] = useState({ semester: '', status: 'DRAFT', capacities: Object.fromEntries(academicStreams.map(([stream]) => [stream, 0])) });
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async (preferredRoundId = '') => {
    setError('');
    try {
      const [management, loadedSemesters] = await Promise.all([getStreamSelectionManagement(), getSemesters()]);
      setData(management);
      setSemesters(loadedSemesters);
      const selected = management.rounds.find((round) => idOf(round) === preferredRoundId) || management.rounds[0];
      setSelectedRoundId(selected?._id || '');
      setValues({
        semester: idOf(selected?.semester) || loadedSemesters[0]?._id || '',
        status: selected?.status === 'ALLOCATED' ? 'ALLOCATED' : selected?.status || 'DRAFT',
        capacities: Object.fromEntries(academicStreams.map(([stream]) => [stream, selected?.capacities.find((item) => item.academicStream === stream)?.seats || 0]))
      });
    } catch (requestError) {
      setError(requestMessage(requestError, 'Stream selection management could not be loaded.'));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const selectRound = (roundId) => {
    const selected = data.rounds.find((round) => round._id === roundId);
    setSelectedRoundId(roundId);
    setValues({
      semester: idOf(selected.semester),
      status: selected.status,
      capacities: Object.fromEntries(academicStreams.map(([stream]) => [stream, selected.capacities.find((item) => item.academicStream === stream)?.seats || 0]))
    });
    setError(''); setMessage('');
  };
  const startNew = () => {
    setSelectedRoundId('');
    setValues({ semester: semesters[0]?._id || '', status: 'DRAFT', capacities: Object.fromEntries(academicStreams.map(([stream]) => [stream, 0])) });
    setError(''); setMessage('');
  };
  const saveRound = async (event) => {
    event.preventDefault(); setBusy('save'); setError(''); setMessage('');
    try {
      const round = await saveStreamSelectionRound({
        semester: values.semester,
        status: values.status,
        capacities: academicStreams.map(([academicStream]) => ({ academicStream, seats: Number(values.capacities[academicStream]) }))
      });
      setMessage('The selection round and all four stream capacities were saved.');
      await load(round._id);
    } catch (requestError) {
      setError(requestMessage(requestError, 'Selection round could not be saved.'));
    } finally {
      setBusy('');
    }
  };

  const selectedRound = data?.rounds.find((round) => round._id === selectedRoundId);
  const preferences = useMemo(() => (data?.preferences || []).filter((preference) => idOf(preference.round) === selectedRoundId), [data, selectedRoundId]);
  const preferencesByStudent = useMemo(() => new Map(preferences.map((preference) => [idOf(preference.student), preference])), [preferences]);
  const students = useMemo(() => [...(data?.eligibleStudents || [])].sort((first, second) => (second.gpa ?? -1) - (first.gpa ?? -1) || first.lastName.localeCompare(second.lastName)), [data]);
  const capacityTotal = Object.values(values.capacities).reduce((sum, seats) => sum + Number(seats || 0), 0);
  const submittedMissingGpa = preferences.filter((preference) => typeof preference.student?.gpa !== 'number').length;
  const allSubmitted = students.length > 0 && preferences.length === students.length;
  const allocate = async () => {
    if (!selectedRoundId) return;
    if (!window.confirm(`Allocate ${preferences.length} submitted students by GPA and their ranked choices? This result is final for the round.`)) return;
    setBusy('allocate'); setError(''); setMessage('');
    try {
      await allocateStreamSelection(selectedRoundId);
      setMessage('Allocation completed. Students can now see their assigned stream.');
      await load(selectedRoundId);
    } catch (requestError) {
      setError(requestMessage(requestError, 'Allocation could not be completed.'));
    } finally {
      setBusy('');
    }
  };

  if (error && !data) return <div className='error-message'>{error}</div>;
  if (!data) return <div className='loading-state'>Loading stream selection management...</div>;
  return <div className='stream-management'>
    <section className='panel'>
      <div className='panel-title'>
        <div><h2>Selection round setup</h2><p>HOD and Exam Committee can prepare Year 3, Semester 2 allocation.</p></div>
        <button type='button' className='secondary-action' onClick={startNew}>New round</button>
      </div>
      {data.rounds.length > 0 && <label className='round-picker'><span>Existing round</span><select value={selectedRoundId} onChange={(event) => selectRound(event.target.value)}><option value=''>New round</option>{data.rounds.map((round) => <option key={round._id} value={round._id}>{round.semester?.name} {round.semester?.academicYear} - {round.status}</option>)}</select></label>}
      <form className='round-form' onSubmit={saveRound}>
        <div className='round-fields'>
          <label><span>Semester</span><select value={values.semester} disabled={Boolean(selectedRoundId)} onChange={(event) => setValues({ ...values, semester: event.target.value })} required><option value=''>Select semester</option>{semesters.map((semester) => <option key={semester._id} value={semester._id}>{semester.name} {semester.academicYear}</option>)}</select></label>
          <label><span>Submission status</span><select value={values.status} disabled={values.status === 'ALLOCATED'} onChange={(event) => setValues({ ...values, status: event.target.value })}>{values.status === 'ALLOCATED' && <option>ALLOCATED</option>}{['DRAFT', 'OPEN', 'CLOSED'].map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
        </div>
        <CapacityCards capacities={values.capacities} disabled={values.status === 'ALLOCATED'} onChange={(stream, seats) => setValues((current) => ({ ...current, capacities: { ...current.capacities, [stream]: seats } }))} />
        <div className='round-actions'>
          <span>Total capacity: <strong>{capacityTotal}</strong></span>
          <button className='primary-action' disabled={busy || values.status === 'ALLOCATED'}><Save size={17} />{busy === 'save' ? 'Saving...' : 'Save round'}</button>
        </div>
      </form>
      {error && <div className='error-message'>{error}</div>}
      {message && <div className='success-message'>{message}</div>}
    </section>

    <section className='panel'>
      <div className='panel-title'>
        <div><h2>GPA allocation queue</h2><p>Students are ordered from highest GPA to lowest GPA.</p></div>
        <span>{preferences.length} of {students.length} submitted</span>
      </div>
      {!selectedRound ? <div className='empty-state'>Save or choose a selection round to review submissions.</div> : <>
        <div className='allocation-metrics'>
          <div><Users size={18} /><span>Submitted<strong>{preferences.length}</strong></span></div>
          <div><ListOrdered size={18} /><span>Total seats<strong>{capacityTotal}</strong></span></div>
          <div><CheckCircle2 size={18} /><span>Missing GPA<strong>{submittedMissingGpa}</strong></span></div>
        </div>
        <div className='selection-table'>
          {students.map((student, index) => {
            const preference = preferencesByStudent.get(student._id);
            return <div className='selection-row' key={student._id}>
              <strong>#{index + 1}</strong>
              <div><span>{student.firstName} {student.lastName}</span><small>{student.studentNumber}</small></div>
              <div><small>GPA</small><span>{typeof student.gpa === 'number' ? student.gpa.toFixed(2) : 'Missing'}</span></div>
              <div><small>Ranked choices</small><span>{preference ? preference.choices.map((choice, choiceIndex) => `${choiceIndex + 1}. ${streamLabel(choice)}`).join(' / ') : 'Not submitted'}</span></div>
              <div><small>Result</small><span>{preference?.allocatedStream ? streamLabel(preference.allocatedStream) : '-'}</span></div>
            </div>;
          })}
        </div>
        <div className='allocation-footer'>
          <p>{!allSubmitted ? 'Collect a preference submission from every eligible Year 3 student.' : selectedRound.status !== 'CLOSED' ? 'Close the submission round before allocation.' : capacityTotal < preferences.length ? 'Increase capacity before allocation.' : submittedMissingGpa ? 'Enter the missing GPA on the Users page before allocation.' : 'Ready to allocate every student by GPA and ranked choice.'}</p>
          <button type='button' className='primary-action' onClick={allocate} disabled={busy || !allSubmitted || capacityTotal < preferences.length || submittedMissingGpa > 0 || selectedRound.status !== 'CLOSED'}>
            <PlayCircle size={18} />{busy === 'allocate' ? 'Allocating...' : selectedRound.status === 'ALLOCATED' ? 'Allocation complete' : 'Run allocation'}
          </button>
        </div>
      </>}
    </section>
  </div>;
}

export function StreamSelectionPage() {
  const { user } = useAuth();
  return user.role === 'STUDENT' ? <StudentStreamSelection /> : <StaffStreamSelection />;
}
