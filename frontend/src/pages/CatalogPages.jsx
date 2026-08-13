import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Eye, EyeOff, FileUp, Pencil, PlusCircle, RefreshCw, Search, X, XCircle } from 'lucide-react';
import { createAssignment, createCourse, createDepartment, createSemester, createUser, getAssignments, getCourses, getDepartments, getExamCommittees, getSemesters, getUsers, importUsersFile, reviewRegistration, saveExamCommittee, updateAssignment, updateCourse, updateDepartment, updateSemester, updateUser } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { academicStreams, groupStudents, isEceDepartment, streamLabel, studentGroupLabel } from '../utils/academicStreams.js';

const allRoles = ['SUPER_ADMIN', 'HOD', 'INSTRUCTOR', 'STUDENT'];
const semesterStatuses = ['DRAFT', 'SCHEDULED', 'OPEN', 'CLOSED', 'ARCHIVED'];
const assignmentStatuses = ['DRAFT', 'VERIFIED', 'PUBLISHED'];

function optionName(user) {
  return user ? `${user.firstName} ${user.lastName}` : '';
}

function isoDate(value) {
  return value ? new Date(value).toISOString().slice(0, 10) : '';
}

function isCommitteeUser(user) {
  return (user.committeeRoles || []).includes('COURSE_EXAM_COMMITTEE');
}

function canManage(page, user) {
  if (page === 'departments') return user.role === 'SUPER_ADMIN';
  if (page === 'semesters') return ['SUPER_ADMIN', 'HOD'].includes(user.role);
  if (page === 'courses' || page === 'assignments') return ['SUPER_ADMIN', 'HOD'].includes(user.role) || isCommitteeUser(user);
  if (page === 'users') return ['SUPER_ADMIN', 'HOD'].includes(user.role);
  return false;
}

function idOf(value) {
  return value?._id || value || '';
}

function sameId(first, second) {
  return String(idOf(first)) === String(idOf(second));
}

function generateTemporaryPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const random = new Uint32Array(12);
  crypto.getRandomValues(random);
  return `Mtu!${Array.from(random, (value) => alphabet[value % alphabet.length]).join('')}`;
}

function roleScopedDepartments(departments, user) {
  if (user.role === 'SUPER_ADMIN') return departments;
  return departments.filter((department) => sameId(department._id, user.department));
}

function courseGroupLabel(course) {
  const department = course.department?.name || 'Department not specified';
  const level = course.yearLevel ? `Year ${course.yearLevel}` : course.level || 'Level/year not specified';
  return `${department} / ${level}`;
}

function DataPage({ title, subtitle, load, columns, form, canEdit, onEdit, groupBy, filterRows, toolbar, rowActions }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    setError('');
    try { setRows(await load()); }
    catch (requestError) { setError(requestError.response?.data?.message || 'Data could not be loaded.'); }
  }, [load]);
  useEffect(() => { refresh(); }, [refresh]);
  const visibleRows = useMemo(() => rows ? (filterRows ? rows.filter(filterRows) : rows) : [], [filterRows, rows]);
  const groupedRows = useMemo(() => {
    if (!groupBy) return [];
    const groups = new Map();
    visibleRows.forEach((row) => {
      const label = groupBy(row);
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(row);
    });
    return [...groups];
  }, [groupBy, visibleRows]);
  const renderRow = (row) => <div className={`data-row${canEdit || rowActions ? ' editable-row' : ''}${rowActions ? ' action-row' : ''}`} style={{ '--data-columns': columns.length }} key={row._id}>{columns.map((column) => <div key={column.label}><small>{column.label}</small><span>{column.value(row)}</span></div>)}{(canEdit || rowActions) && <div className='data-row-actions'>{rowActions?.(row, { refresh })}{canEdit && <button className='icon-action' type='button' onClick={() => onEdit(row)} title={`Edit ${title}`} aria-label={`Edit ${title} record`}><Pencil size={16} /></button>}</div>}</div>;
  if (error && !rows) return <div className='error-message'>{error}</div>;
  return <>
    {form?.({ refresh })}
    <section className='panel data-page'>
      <div className='panel-title'><div><h2>{title}</h2><p>{subtitle}</p></div><span>{rows && visibleRows.length !== rows.length ? `${visibleRows.length} of ${rows.length}` : visibleRows.length} records</span></div>
      {toolbar}
      {error && <div className='error-message'>{error}</div>}
      {!rows ? <div className='loading-state'>Loading data...</div> : !visibleRows.length ? <div className='empty-state'>{rows.length ? 'No records match the current filters.' : 'No records found.'}</div> :
        <div className='data-table'>{groupBy ? groupedRows.map(([label, group]) => <section className='data-group' key={label}><h3>{label}</h3>{group.map(renderRow)}</section>) : visibleRows.map(renderRow)}</div>
      }
    </section>
  </>;
}

function AdminForm({ id, title, children, onSubmit, message, editing, onCancel }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault(); setError(''); setBusy(true);
    try { await onSubmit(); }
    catch (requestError) { setError(requestError.response?.data?.message || 'Record could not be saved.'); }
    finally { setBusy(false); }
  };
  return <section id={id} className={`panel admin-entry-panel${editing ? ' editing-panel' : ''}`}>
    <div className='panel-title'><div><h2>{editing ? `Edit ${title}` : `Add ${title}`}</h2><p>{message}</p></div>{editing ? <button className='icon-action' type='button' onClick={onCancel} title='Cancel edit'><X size={18} /></button> : <PlusCircle size={22} />}</div>
    <form className='admin-form' onSubmit={submit}>{children}{error && <div className='error-message'>{error}</div>}<button className='primary-action' disabled={busy}>{busy ? 'Saving...' : editing ? 'Update data' : 'Save data'}</button></form>
  </section>;
}

export function DepartmentsPage() {
  const { user } = useAuth();
  const editable = canManage('departments', user);
  const initial = { code: '', name: '', faculty: '', hod: '' };
  const [values, setValues] = useState(initial);
  const [editingId, setEditingId] = useState('');
  const [hods, setHods] = useState([]);
  useEffect(() => { getUsers('HOD').then(setHods).catch(() => setHods([])); }, []);
  const reset = () => { setValues(initial); setEditingId(''); };
  const save = async (refresh) => {
    const payload = { code: values.code, name: values.name, faculty: values.faculty, ...(values.hod ? { hod: values.hod } : {}) };
    if (editingId) await updateDepartment(editingId, payload); else await createDepartment(payload);
    reset(); await refresh();
  };
  const edit = (row) => { setEditingId(row._id); setValues({ code: row.code || '', name: row.name || '', faculty: row.faculty || '', hod: row.hod?._id || '' }); };
  return <DataPage title='Departments' subtitle='Academic units loaded from the backend.' load={getDepartments} canEdit={editable} onEdit={edit} form={({ refresh }) => editable && <AdminForm title='Department' message='Only Super Admin can add or modify departments.' editing={Boolean(editingId)} onCancel={reset} onSubmit={() => save(refresh)}>
    <label><span>Code</span><input value={values.code} onChange={(event) => setValues({ ...values, code: event.target.value })} required placeholder='CS' /></label>
    <label><span>Department</span><input value={values.name} onChange={(event) => setValues({ ...values, name: event.target.value })} required placeholder='Computer Science' /></label>
    <label><span>Faculty</span><input value={values.faculty} onChange={(event) => setValues({ ...values, faculty: event.target.value })} required placeholder='Engineering and Technology' /></label>
    <label><span>Head</span><select value={values.hod} onChange={(event) => setValues({ ...values, hod: event.target.value })}><option value=''>Assign later</option>{hods.map((hod) => <option value={hod._id} key={hod._id}>{optionName(hod)}</option>)}</select></label>
  </AdminForm>} columns={[
    { label: 'Code', value: (row) => row.code },
    { label: 'Department', value: (row) => row.name },
    { label: 'Faculty', value: (row) => row.faculty },
    { label: 'Head', value: (row) => row.hod ? optionName(row.hod) : 'Not assigned' }
  ]} />;
}

export function SemestersPage() {
  const { user } = useAuth();
  const editable = canManage('semesters', user);
  const initial = { name: '', academicYear: '', startsAt: '', endsAt: '', evaluationOpensAt: '', evaluationClosesAt: '', status: 'DRAFT' };
  const [values, setValues] = useState(initial);
  const [editingId, setEditingId] = useState('');
  const reset = () => { setValues(initial); setEditingId(''); };
  const save = async (refresh) => {
    const payload = { ...values, evaluationOpensAt: values.evaluationOpensAt || undefined, evaluationClosesAt: values.evaluationClosesAt || undefined };
    if (editingId) await updateSemester(editingId, payload); else await createSemester(payload);
    reset(); await refresh();
  };
  const edit = (row) => { setEditingId(row._id); setValues({ name: row.name || '', academicYear: row.academicYear || '', startsAt: isoDate(row.startsAt), endsAt: isoDate(row.endsAt), evaluationOpensAt: isoDate(row.evaluationOpensAt), evaluationClosesAt: isoDate(row.evaluationClosesAt), status: row.status || 'DRAFT' }); };
  return <DataPage title='Semesters' subtitle='Evaluation windows and academic periods.' load={getSemesters} canEdit={editable} onEdit={edit} form={({ refresh }) => editable && <AdminForm title='Semester' message='Super Admin and HOD can add or modify evaluation periods.' editing={Boolean(editingId)} onCancel={reset} onSubmit={() => save(refresh)}>
    <label><span>Name</span><input value={values.name} onChange={(event) => setValues({ ...values, name: event.target.value })} required placeholder='Fall Semester' /></label>
    <label><span>Academic year</span><input value={values.academicYear} onChange={(event) => setValues({ ...values, academicYear: event.target.value })} required placeholder='2026/2027' /></label>
    <label><span>Starts</span><input type='date' value={values.startsAt} onChange={(event) => setValues({ ...values, startsAt: event.target.value })} required /></label>
    <label><span>Ends</span><input type='date' value={values.endsAt} onChange={(event) => setValues({ ...values, endsAt: event.target.value })} required /></label>
    <label><span>Evaluation opens</span><input type='date' value={values.evaluationOpensAt} onChange={(event) => setValues({ ...values, evaluationOpensAt: event.target.value })} /></label>
    <label><span>Evaluation closes</span><input type='date' value={values.evaluationClosesAt} onChange={(event) => setValues({ ...values, evaluationClosesAt: event.target.value })} /></label>
    <label><span>Status</span><select value={values.status} onChange={(event) => setValues({ ...values, status: event.target.value })}>{semesterStatuses.map((status) => <option value={status} key={status}>{status}</option>)}</select></label>
  </AdminForm>} columns={[
    { label: 'Name', value: (row) => row.name },
    { label: 'Academic Year', value: (row) => row.academicYear },
    { label: 'Status', value: (row) => row.status },
    { label: 'Evaluation Closes', value: (row) => row.evaluationClosesAt ? new Date(row.evaluationClosesAt).toLocaleDateString() : 'Not set' }
  ]} />;
}

export function CoursesPage() {
  const { user } = useAuth();
  const editable = canManage('courses', user);
  const departmentLocked = user.role !== 'SUPER_ADMIN';
  const initial = { code: '', title: '', creditHours: 3, department: '', semester: '', level: '', yearLevel: '', academicStream: '' };
  const [values, setValues] = useState(initial);
  const [editingId, setEditingId] = useState('');
  const [departments, setDepartments] = useState([]);
  const [semesters, setSemesters] = useState([]);
  const selectedDepartment = departments.find((department) => sameId(department, values.department));
  const isEceCourse = isEceDepartment(selectedDepartment);
  useEffect(() => { Promise.all([getDepartments(), getSemesters()]).then(([loadedDepartments, loadedSemesters]) => { const availableDepartments = roleScopedDepartments(loadedDepartments, user); setDepartments(availableDepartments); setSemesters(loadedSemesters); setValues((current) => ({ ...current, department: current.department || availableDepartments[0]?._id || '', semester: current.semester || loadedSemesters[0]?._id || '' })); }).catch(() => {}); }, [user]);
  const reset = () => { setValues({ ...initial, department: departments[0]?._id || '', semester: semesters[0]?._id || '' }); setEditingId(''); };
  const save = async (refresh) => {
    const payload = { ...values, creditHours: Number(values.creditHours), yearLevel: values.yearLevel ? Number(values.yearLevel) : '' };
    if (!payload.yearLevel) delete payload.yearLevel;
    if (!payload.academicStream) delete payload.academicStream;
    if (editingId) await updateCourse(editingId, payload); else await createCourse(payload);
    reset(); await refresh();
  };
  const edit = (row) => { setEditingId(row._id); setValues({ code: row.code || '', title: row.title || '', creditHours: row.creditHours || 3, department: row.department?._id || '', semester: row.semester?._id || '', level: row.level || '', yearLevel: row.yearLevel || '', academicStream: row.academicStream || '' }); };
  return <DataPage title='Courses' subtitle={user.role === 'STUDENT' ? 'Courses in your department, organized by year or level.' : 'Courses organized by department and year or level.'} load={getCourses} groupBy={courseGroupLabel} canEdit={editable} onEdit={edit} form={({ refresh }) => editable && <AdminForm title='Course' message={departmentLocked ? 'Your HOD or committee account can add courses only to its assigned department. Log in as Admin to choose any department.' : 'Administrator access: choose any department and semester for this course.'} editing={Boolean(editingId)} onCancel={reset} onSubmit={() => save(refresh)}>
    <label><span>Code</span><input value={values.code} onChange={(event) => setValues({ ...values, code: event.target.value })} required placeholder='CS401' /></label>
    <label><span>Title</span><input value={values.title} onChange={(event) => setValues({ ...values, title: event.target.value })} required placeholder='Software Engineering' /></label>
    <label><span>Credit hours</span><input type='number' min='1' max='8' value={values.creditHours} onChange={(event) => setValues({ ...values, creditHours: event.target.value })} required /></label>
    <label><span>Department</span><select value={values.department} onChange={(event) => { const department = departments.find((item) => sameId(item, event.target.value)); setValues({ ...values, department: event.target.value, academicStream: isEceDepartment(department) ? values.academicStream : '' }); }} disabled={departmentLocked} required><option value='' disabled>Select department</option>{departments.map((department) => <option value={department._id} key={department._id}>{department.name}</option>)}</select></label>
    <label><span>Semester</span><select value={values.semester} onChange={(event) => setValues({ ...values, semester: event.target.value })} required><option value='' disabled>Select semester</option>{semesters.map((semester) => <option value={semester._id} key={semester._id}>{semester.name} {semester.academicYear}</option>)}</select></label>
    <label><span>Class / section</span><input value={values.level} onChange={(event) => setValues({ ...values, level: event.target.value })} placeholder='Year 4 / Section A' /></label>
    <label><span>Year level</span><select value={values.yearLevel} onChange={(event) => { const yearLevel = event.target.value; setValues({ ...values, yearLevel, academicStream: Number(yearLevel) >= 4 ? values.academicStream : '' }); }}><option value=''>Not specified</option>{[2, 3, 4, 5].map((year) => <option value={year} key={year}>Year {year}</option>)}</select></label>
    {isEceCourse && Number(values.yearLevel) >= 4 && <label><span>Branch / stream</span><select value={values.academicStream} onChange={(event) => setValues({ ...values, academicStream: event.target.value })} required><option value='' disabled>Select stream</option>{academicStreams.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>}
  </AdminForm>} columns={[
    { label: 'Code', value: (row) => row.code },
    { label: 'Course / Stream', value: (row) => `${row.title}${row.academicStream ? ` / ${streamLabel(row.academicStream)}` : ''}` },
    { label: 'Department', value: (row) => row.department?.name || '-' },
    { label: 'Year / Level', value: (row) => row.yearLevel ? `Year ${row.yearLevel}${row.level ? ` / ${row.level}` : ''}` : row.level || 'Not specified' },
    { label: 'Semester', value: (row) => row.semester ? row.semester.name + ' ' + row.semester.academicYear : '-' }
  ]} />;
}

export function CourseAssignmentsPage() {
  const { user } = useAuth();
  const editable = canManage('assignments', user);
  const initial = { instructor: '', course: '', semester: '', enrollmentMode: 'INDIVIDUAL', enrolledStudents: [], peerEvaluators: [], status: 'DRAFT' };
  const [values, setValues] = useState(initial);
  const [editingId, setEditingId] = useState('');
  const [instructors, setInstructors] = useState([]);
  const [courses, setCourses] = useState([]);
  const [semesters, setSemesters] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const loadCourseAssignments = useCallback(async () => { const loaded = await getAssignments(); setAssignments(loaded); return loaded; }, []);
  useEffect(() => { Promise.all([getUsers('INSTRUCTOR'), getCourses(), getSemesters(), getAssignments()]).then(([loadedInstructors, loadedCourses, loadedSemesters, loadedAssignments]) => {
    const assignedCourseIds = new Set(loadedAssignments.map((assignment) => idOf(assignment.course)));
    const firstCourse = loadedCourses.find((course) => !assignedCourseIds.has(course._id)) || loadedCourses[0];
    setInstructors(loadedInstructors); setCourses(loadedCourses); setSemesters(loadedSemesters); setAssignments(loadedAssignments);
    setValues((current) => ({ ...current, instructor: current.instructor || loadedInstructors[0]?._id || '', course: current.course || firstCourse?._id || '', semester: current.semester || idOf(firstCourse?.semester) || loadedSemesters[0]?._id || '' }));
  }).catch(() => {}); }, []);
  const selectedCourse = useMemo(() => courses.find((course) => sameId(course._id, values.course)), [courses, values.course]);
  const assignableCourses = useMemo(() => courses.filter((course) => (editingId && sameId(course._id, values.course)) || !assignments.some((assignment) => sameId(assignment.course, course._id))), [assignments, courses, editingId, values.course]);
  const courseDepartment = idOf(selectedCourse?.department);
  const eligibleInstructors = useMemo(() => instructors.filter((instructor) => (!courseDepartment || sameId(instructor.department, courseDepartment)) && (!selectedCourse?.academicStream || instructor.academicStream === selectedCourse.academicStream)), [courseDepartment, instructors, selectedCourse]);
  useEffect(() => {
    if (!selectedCourse) return;
    setValues((current) => ({ ...current, semester: idOf(selectedCourse.semester), instructor: eligibleInstructors.some((instructor) => sameId(instructor._id, current.instructor)) ? current.instructor : eligibleInstructors[0]?._id || '' }));
  }, [eligibleInstructors, selectedCourse]);
  const reset = (currentAssignments = assignments) => { const assignedCourseIds = new Set(currentAssignments.map((assignment) => idOf(assignment.course))); const course = courses.find((item) => !assignedCourseIds.has(item._id)); setValues({ ...initial, instructor: instructors[0]?._id || '', course: course?._id || '', semester: idOf(course?.semester) || semesters[0]?._id || '' }); setEditingId(''); };
  const save = async (refresh) => {
    if (editingId) await updateAssignment(editingId, values); else await createAssignment(values);
    const loadedAssignments = await getAssignments();
    setAssignments(loadedAssignments);
    reset(loadedAssignments);
    await refresh();
  };
  const edit = (row) => { setEditingId(row._id); setValues({ instructor: row.instructor?._id || '', course: row.course?._id || '', semester: row.semester?._id || '', enrollmentMode: row.enrollmentMode || 'INDIVIDUAL', enrolledStudents: row.enrolledStudents?.map((student) => student._id) || [], peerEvaluators: row.peerEvaluators?.map((peer) => peer._id) || [], status: row.status || 'DRAFT', ...(row.studentCohort ? { studentCohort: row.studentCohort } : {}) }); };
  return <DataPage title='Course Assignments' subtitle='Courses assigned to instructors by the HOD or Course and Exam Committee.' load={loadCourseAssignments} canEdit={editable} onEdit={edit} form={({ refresh }) => editable && <AdminForm id='assign-course-instructor' title='Course to Instructor' message='Select the course and the instructor who will teach it. Evaluation setup is completed separately.' editing={Boolean(editingId)} onCancel={() => reset()} onSubmit={() => save(refresh)}>
    <label><span>Course to assign</span><select value={values.course} onChange={(event) => setValues({ ...values, course: event.target.value })} required><option value=''>Select unassigned course</option>{assignableCourses.map((course) => <option value={course._id} key={course._id}>{course.code} - {course.title}{course.yearLevel ? ` (Year ${course.yearLevel})` : ''}{course.academicStream ? ` / ${streamLabel(course.academicStream)}` : ''}</option>)}</select></label>
    <label><span>Instructor who will teach the course</span><select value={values.instructor} onChange={(event) => setValues({ ...values, instructor: event.target.value })} required disabled={!eligibleInstructors.length}><option value=''>{eligibleInstructors.length ? 'Select instructor' : 'No eligible instructor'}</option>{eligibleInstructors.map((instructor) => <option value={instructor._id} key={instructor._id}>{optionName(instructor)}{instructor.academicStream ? ` - ${streamLabel(instructor.academicStream)}` : ''}</option>)}</select></label>
    <label><span>Semester</span><select value={values.semester} disabled required>{semesters.map((semester) => <option value={semester._id} key={semester._id}>{semester.name} {semester.academicYear}</option>)}</select></label>
    <div className='role-panel'><strong>Teaching assignment only</strong><p>After saving, open Evaluation Assignments to select the student class, peer evaluators, and publication status.</p></div>
  </AdminForm>} columns={[
    { label: 'Course', value: (row) => row.course ? `${row.course.code} - ${row.course.title}` : '-' },
    { label: 'Assigned Instructor', value: (row) => row.instructor ? optionName(row.instructor) : '-' },
    { label: 'Semester', value: (row) => row.semester ? `${row.semester.name} ${row.semester.academicYear}` : '-' },
    { label: 'Evaluation Setup', value: (row) => row.status === 'PUBLISHED' ? 'Published' : row.enrolledStudents?.length ? 'In progress' : 'Not configured' }
  ]} />;
}

export function AssignmentsPage() {
  const { user } = useAuth();
  const editable = canManage('assignments', user);
  const initial = { assignmentId: '', instructor: '', course: '', semester: '', enrollmentMode: 'COHORT', studentCohort: null, enrolledStudents: [], peerEvaluators: [], status: 'PUBLISHED' };
  const [values, setValues] = useState(initial);
  const [editingId, setEditingId] = useState('');
  const [instructors, setInstructors] = useState([]);
  const [students, setStudents] = useState([]);
  const [courses, setCourses] = useState([]);
  const [semesters, setSemesters] = useState([]);
  const [courseAssignments, setCourseAssignments] = useState([]);
  useEffect(() => { Promise.all([getUsers('INSTRUCTOR'), getUsers('STUDENT'), getCourses(), getSemesters(), getAssignments()]).then(([loadedInstructors, loadedStudents, loadedCourses, loadedSemesters, loadedAssignments]) => { const firstAssignment = loadedAssignments[0]; setInstructors(loadedInstructors); setStudents(loadedStudents); setCourses(loadedCourses); setSemesters(loadedSemesters); setCourseAssignments(loadedAssignments); setValues((current) => current.assignmentId ? current : ({ ...current, assignmentId: firstAssignment?._id || '', instructor: idOf(firstAssignment?.instructor), course: idOf(firstAssignment?.course), semester: idOf(firstAssignment?.semester), enrollmentMode: 'COHORT', studentCohort: firstAssignment?.studentCohort || null, enrolledStudents: firstAssignment?.enrolledStudents?.map((student) => student._id) || [], peerEvaluators: firstAssignment?.peerEvaluators?.map((peer) => peer._id) || [], status: 'PUBLISHED' })); }).catch(() => {}); }, []);
  const selectedCourse = useMemo(() => courses.find((course) => sameId(course._id, values.course)), [courses, values.course]);
  const courseDepartment = idOf(selectedCourse?.department);
  const departmentInstructors = useMemo(() => instructors.filter((instructor) => !courseDepartment || sameId(instructor.department, courseDepartment)), [courseDepartment, instructors]);
  const availableInstructors = useMemo(() => departmentInstructors.filter((instructor) => !selectedCourse?.academicStream || instructor.academicStream === selectedCourse.academicStream), [departmentInstructors, selectedCourse]);
  const availableStudents = useMemo(() => students.filter((student) => (!courseDepartment || sameId(student.department, courseDepartment)) && (!selectedCourse?.yearLevel || student.yearLevel === selectedCourse.yearLevel) && (!selectedCourse?.academicStream || student.academicStream === selectedCourse.academicStream)), [courseDepartment, selectedCourse, students]);
  const studentGroups = useMemo(() => groupStudents(availableStudents), [availableStudents]);
  const cohortOptions = useMemo(() => studentGroups.map(([label, group]) => ({ label, students: group, yearLevel: group[0]?.yearLevel, academicStream: group[0]?.academicStream || '' })).filter((cohort) => cohort.yearLevel), [studentGroups]);
  const selectedCohortValue = values.studentCohort ? `${values.studentCohort.yearLevel}|${values.studentCohort.academicStream || ''}` : '';
  const selectedCohort = cohortOptions.find((cohort) => `${cohort.yearLevel}|${cohort.academicStream}` === selectedCohortValue);
  const selectedStudents = useMemo(() => new Set(values.enrolledStudents), [values.enrolledStudents]);
  const availablePeers = useMemo(() => departmentInstructors.filter((instructor) => !sameId(instructor._id, values.instructor)), [departmentInstructors, values.instructor]);
  const selectedPeers = useMemo(() => new Set(values.peerEvaluators), [values.peerEvaluators]);
  const selectCourseAssignment = (assignmentId) => {
    const assignment = courseAssignments.find((item) => sameId(item._id, assignmentId));
    setValues({ ...values, assignmentId, instructor: idOf(assignment?.instructor), course: idOf(assignment?.course), semester: idOf(assignment?.semester), enrollmentMode: 'COHORT', studentCohort: assignment?.studentCohort || null, enrolledStudents: assignment?.enrolledStudents?.map((student) => student._id) || [], peerEvaluators: assignment?.peerEvaluators?.map((peer) => peer._id) || [], status: 'PUBLISHED' });
  };
  useEffect(() => {
    if (!selectedCourse) return;
    const courseSemester = idOf(selectedCourse.semester);
    setValues((current) => {
      const nextInstructor = availableInstructors.some((instructor) => sameId(instructor._id, current.instructor)) ? current.instructor : availableInstructors[0]?._id || '';
      const nextStudents = current.enrolledStudents.filter((studentId) => availableStudents.some((student) => sameId(student._id, studentId)));
      const nextPeers = current.peerEvaluators.filter((peerId) => !sameId(peerId, nextInstructor) && departmentInstructors.some((instructor) => sameId(instructor._id, peerId)));
      if (sameId(current.semester, courseSemester) && sameId(current.instructor, nextInstructor) && nextStudents.length === current.enrolledStudents.length && nextPeers.length === current.peerEvaluators.length) return current;
      return { ...current, semester: courseSemester, instructor: nextInstructor, enrolledStudents: nextStudents, peerEvaluators: nextPeers };
    });
  }, [availableInstructors, availableStudents, departmentInstructors, selectedCourse]);
  useEffect(() => {
    if (values.enrollmentMode !== 'COHORT') return;
    const currentIsAvailable = cohortOptions.some((cohort) => `${cohort.yearLevel}|${cohort.academicStream}` === selectedCohortValue);
    if (currentIsAvailable || !cohortOptions.length) return;
    const first = cohortOptions[0];
    setValues((current) => ({ ...current, studentCohort: { yearLevel: first.yearLevel, ...(first.academicStream ? { academicStream: first.academicStream } : {}) } }));
  }, [cohortOptions, selectedCohortValue, values.enrollmentMode]);
  const toggleStudent = (studentId) => setValues({ ...values, enrolledStudents: selectedStudents.has(studentId) ? values.enrolledStudents.filter((id) => id !== studentId) : [...values.enrolledStudents, studentId] });
  const togglePeer = (peerId) => setValues({ ...values, peerEvaluators: selectedPeers.has(peerId) ? values.peerEvaluators.filter((id) => id !== peerId) : [...values.peerEvaluators, peerId] });
  const reset = () => { const assignment = courseAssignments[0]; setValues({ ...initial, assignmentId: assignment?._id || '', instructor: idOf(assignment?.instructor), course: idOf(assignment?.course), semester: idOf(assignment?.semester) }); setEditingId(''); };
  const save = async (refresh) => {
    const { assignmentId: selectedAssignmentId, ...assignmentValues } = values;
    const payload = {
      ...assignmentValues,
      studentCohort: values.enrollmentMode === 'COHORT' ? values.studentCohort : undefined,
      enrolledStudents: values.enrollmentMode === 'INDIVIDUAL' ? values.enrolledStudents.filter((studentId) => availableStudents.some((student) => sameId(student._id, studentId))) : [],
      peerEvaluators: values.peerEvaluators.filter((peerId) => availablePeers.some((peer) => sameId(peer._id, peerId)))
    };
    const assignmentId = editingId || selectedAssignmentId;
    if (!assignmentId) throw new Error('Create a course assignment before configuring its evaluation');
    await updateAssignment(assignmentId, payload);
    setCourseAssignments(await getAssignments());
    reset(); await refresh();
  };
  const edit = (row) => { setEditingId(row._id); setValues({ assignmentId: row._id, instructor: row.instructor?._id || '', course: row.course?._id || '', semester: row.semester?._id || '', enrollmentMode: row.enrollmentMode || (row.studentCohort ? 'COHORT' : 'INDIVIDUAL'), studentCohort: row.studentCohort || null, enrolledStudents: row.enrolledStudents?.map((student) => student._id) || [], peerEvaluators: row.peerEvaluators?.map((peer) => peer._id) || [], status: row.status || 'PUBLISHED' }); };
  return <DataPage title='Instructor Evaluation Assignments' subtitle='Assignments created by the HOD or Course and Exam Committee become student, peer, and HOD evaluation targets.' load={getAssignments} canEdit={editable} onEdit={edit} form={({ refresh }) => editable && <AdminForm id='assign-instructor-evaluation' title='Instructor for Evaluation' message='The HOD or appointed Course and Exam Committee can select an instructor, course, and entire student class.' editing={Boolean(editingId)} onCancel={reset} onSubmit={() => save(refresh)}>
    <label><span>Existing course assignment</span><select value={values.assignmentId || ''} onChange={(event) => selectCourseAssignment(event.target.value)} required><option value=''>Select assigned course and instructor</option>{courseAssignments.map((assignment) => <option value={assignment._id} key={assignment._id}>{assignment.course?.code} - {assignment.course?.title} / {optionName(assignment.instructor)}</option>)}</select></label>
    <label><span>Instructor to be evaluated</span><input value={optionName(courseAssignments.find((assignment) => sameId(assignment._id, values.assignmentId))?.instructor)} disabled /></label>
    <label><span>Assigned course</span><input value={selectedCourse ? `${selectedCourse.code} - ${selectedCourse.title}` : ''} disabled /></label>
    <label><span>Semester</span><select value={values.semester} disabled required>{semesters.map((semester) => <option value={semester._id} key={semester._id}>{semester.name} {semester.academicYear}</option>)}</select></label>
    <label><span>Status</span><select value={values.status} onChange={(event) => setValues({ ...values, status: event.target.value })}>{assignmentStatuses.map((status) => <option value={status} key={status}>{status}</option>)}</select></label>
    {selectedCourse && !availableInstructors.length && <div className='error-message'>No active instructor is registered in {selectedCourse.department?.name || 'this course department'}. Edit the instructor on the Users page and select this same department.</div>}
    <label><span>Student assignment method</span><select value={values.enrollmentMode} onChange={(event) => setValues({ ...values, enrollmentMode: event.target.value })}><option value='COHORT'>Assign an entire class</option><option value='INDIVIDUAL'>Select individual students</option></select></label>
    {values.enrollmentMode === 'COHORT' ? <div className='student-picker cohort-picker'><span>Class of students who will evaluate this instructor</span>{cohortOptions.length ? <><select value={selectedCohortValue} onChange={(event) => { const cohort = cohortOptions.find((item) => `${item.yearLevel}|${item.academicStream}` === event.target.value); setValues({ ...values, studentCohort: cohort ? { yearLevel: cohort.yearLevel, ...(cohort.academicStream ? { academicStream: cohort.academicStream } : {}) } : null }); }} required><option value=''>Select class</option>{cohortOptions.map((cohort) => <option key={`${cohort.yearLevel}|${cohort.academicStream}`} value={`${cohort.yearLevel}|${cohort.academicStream}`}>{cohort.label} - {cohort.students.length} students</option>)}</select>{selectedCohort && <strong className='cohort-summary'>All {selectedCohort.students.length} active students in {selectedCohort.label} will be assigned automatically.</strong>}</> : <em>No class matches this course year and stream. Add or update students from the Users page first.</em>}</div> : <div className='student-picker'><span>Select individual eligible students</span>{studentGroups.length ? studentGroups.map(([label, group]) => <div className='student-group' key={label}><strong>{label} ({group.length})</strong>{group.map((student) => <label key={student._id}><input type='checkbox' checked={selectedStudents.has(student._id)} onChange={() => toggleStudent(student._id)} />{optionName(student)} ({student.studentNumber || student.email})</label>)}</div>) : <em>No students match this course year and stream. Add or update students from the Users page first.</em>}</div>}
    <div className='student-picker'><span>Peer / colleague evaluators</span>{availablePeers.length ? availablePeers.map((peer) => <label key={peer._id}><input type='checkbox' checked={selectedPeers.has(peer._id)} onChange={() => togglePeer(peer._id)} />{optionName(peer)} ({peer.email})</label>) : <em>Add another instructor in this department to assign a peer evaluation.</em>}</div>
  </AdminForm>} columns={[
    { label: 'Instructor', value: (row) => row.instructor ? optionName(row.instructor) : '-' },
    { label: 'Course / Class', value: (row) => row.course ? `${row.course.code} - ${row.course.title}${row.course.yearLevel ? ` (Year ${row.course.yearLevel})` : row.course.level ? ` (${row.course.level})` : ''}${row.course.academicStream ? ` / ${streamLabel(row.course.academicStream)}` : ''}` : '-' },
    { label: 'Student Class', value: (row) => row.studentCohort ? `Year ${row.studentCohort.yearLevel}${row.studentCohort.academicStream ? ` / ${streamLabel(row.studentCohort.academicStream)}` : ''} (${row.enrolledStudents?.length || 0})` : `${row.enrolledStudents?.length || 0} individually selected` },
    { label: 'Status', value: (row) => row.status || '-' }
  ]} />;
}

export function ExamCommitteesPage() {
  const { user } = useAuth();
  const [semesters, setSemesters] = useState([]);
  const [instructors, setInstructors] = useState([]);
  const [committees, setCommittees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [semester, setSemester] = useState('');
  const [department, setDepartment] = useState('');
  const [members, setMembers] = useState([]);
  const [chair, setChair] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [loadedSemesters, loadedInstructors, loadedCommittees, loadedDepartments] = await Promise.all([getSemesters(), getUsers('INSTRUCTOR'), getExamCommittees(), getDepartments()]);
    setSemesters(loadedSemesters);
    setInstructors(loadedInstructors.filter((instructor) => instructor.isActive !== false));
    setCommittees(loadedCommittees);
    setDepartments(loadedDepartments);
    setSemester((current) => current || loadedSemesters[0]?._id || '');
    setDepartment((current) => current || idOf(user.department) || loadedDepartments[0]?._id || '');
  }, [user.department]);

  const departmentInstructors = useMemo(() => instructors.filter((instructor) => sameId(instructor.department, department)), [department, instructors]);

  useEffect(() => { refresh().catch((requestError) => setError(requestError.response?.data?.message || 'Course and Exam Committee data could not be loaded.')); }, [refresh]);
  useEffect(() => {
    const existing = committees.find((committee) => sameId(committee.semester, semester) && sameId(committee.department, department));
    const existingMembers = existing?.members?.map((member) => member._id) || [];
    setMembers(existingMembers);
    setChair(existing?.chair?._id || existingMembers[0] || '');
  }, [committees, department, semester]);

  const toggleMember = (instructorId) => {
    const next = members.includes(instructorId)
      ? members.filter((memberId) => memberId !== instructorId)
      : members.length < 3 ? [...members, instructorId] : members;
    setMembers(next);
    if (!next.includes(chair)) setChair(next[0] || '');
    setError('');
    setSuccess('');
  };

  const save = async (event) => {
    event.preventDefault();
    if (members.length !== 3) { setError('Select exactly three instructors.'); return; }
    setBusy(true); setError(''); setSuccess('');
    try {
      await saveExamCommittee({ department, semester, members, chair });
      await refresh();
      setSuccess('The three-instructor Course and Exam Committee was assigned for this semester.');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Course and Exam Committee could not be saved.');
    } finally { setBusy(false); }
  };

  return <div className='instructor-section'>
    <section className='panel admin-entry-panel'>
      <div className='panel-title'><div><h2>Assign Course and Exam Committee</h2><p>Select exactly three active instructors who will share all course and examination committee duties for this semester.</p></div><span>{members.length} / 3 selected</span></div>
      <form className='admin-form' onSubmit={save}>
        {user.role === 'SUPER_ADMIN' && <label><span>Department</span><select value={department} onChange={(event) => { setDepartment(event.target.value); setSuccess(''); setError(''); }} required><option value='' disabled>Select department</option>{departments.map((item) => <option value={item._id} key={item._id}>{item.name} ({item.code})</option>)}</select></label>}
        <label><span>Semester</span><select value={semester} onChange={(event) => { setSemester(event.target.value); setSuccess(''); setError(''); }} required><option value='' disabled>Select semester</option>{semesters.map((item) => <option value={item._id} key={item._id}>{item.name} {item.academicYear}</option>)}</select></label>
        <label><span>Committee chair</span><select value={chair} onChange={(event) => setChair(event.target.value)} disabled={!members.length} required><option value='' disabled>Select chair</option>{departmentInstructors.filter((instructor) => members.includes(instructor._id)).map((instructor) => <option value={instructor._id} key={instructor._id}>{optionName(instructor)}</option>)}</select></label>
        <div className='student-picker'><span>Department instructors - select exactly three</span>{departmentInstructors.length ? departmentInstructors.map((instructor) => { const selected = members.includes(instructor._id); return <label key={instructor._id}><input type='checkbox' checked={selected} disabled={!selected && members.length >= 3} onChange={() => toggleMember(instructor._id)} />{optionName(instructor)}{instructor.academicStream ? ` / ${streamLabel(instructor.academicStream)}` : ''} ({instructor.email})</label>; }) : <em>No active instructors are registered in the selected department.</em>}</div>
        {departmentInstructors.length < 3 && <div className='error-message'>At least three active instructors must be registered in the selected department before a committee can be assigned.</div>}
        {error && <div className='error-message'>{error}</div>}
        {success && <div className='success-message'>{success}</div>}
        <button className='primary-action' disabled={busy || !department || members.length !== 3 || !chair || !semester}>{busy ? 'Saving...' : 'Assign Course and Exam Committee'}</button>
      </form>
    </section>
    <section className='panel data-page'>
      <div className='panel-title'><div><h2>Appointed Committee Members</h2><p>{user.role === 'SUPER_ADMIN' ? 'Saved Course and Exam Committees across all departments.' : "Your department's saved Course and Exam Committees."}</p></div><span>{committees.length} records</span></div>
      {!committees.length ? <div className='empty-state'>No Course and Exam Committee has been assigned yet.</div> : <div className='committee-grid'>{committees.map((committee) => <article className='course-roster-card' key={committee._id}><div className='course-roster-heading'><div><strong>{committee.semester?.name} {committee.semester?.academicYear}</strong><span>{committee.department?.name}</span></div><em>{committee.status}</em></div><div className='roster-title'>Three appointed instructors with unified duties</div><div className='student-roster'>{committee.members.map((member) => <div key={member._id}><strong>{optionName(member)}{sameId(member, committee.chair) ? ' - Chair' : ''}</strong><small>{member.academicStream ? `${streamLabel(member.academicStream)} / ` : ''}{member.email}</small></div>)}</div></article>)}</div>}
    </section>
  </div>;
}

function UserImportForm({ user, departments, refresh }) {
  const [role, setRole] = useState('STUDENT');
  const [department, setDepartment] = useState('');
  const [file, setFile] = useState(null);
  const [fileKey, setFileKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    setDepartment((current) => current || idOf(user.department) || departments[0]?._id || '');
  }, [departments, user.department]);

  const submit = async (event) => {
    event.preventDefault();
    if (!file) return;
    setBusy(true); setMessage(''); setError('');
    try {
      const result = await importUsersFile(file, role, department);
      setMessage(`${result.imported} ${role === 'STUDENT' ? 'student' : 'instructor'} account(s) imported successfully.`);
      setFile(null);
      setFileKey((current) => current + 1);
      await refresh();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'The user file could not be imported.');
    } finally {
      setBusy(false);
    }
  };

  const columns = role === 'STUDENT'
    ? 'firstName, lastName, email, studentNumber, yearLevel, gpa, academicStream, password'
    : 'firstName, lastName, email, employeeNumber, academicStream, password';
  const downloadTemplate = () => {
    const content = role === 'STUDENT'
      ? 'firstName,lastName,email,studentNumber,yearLevel,gpa,academicStream,password\nHana,Bekele,hana@mtu.edu.et,ECE-3001,3,3.45,,Password123!\n'
      : 'firstName,lastName,email,employeeNumber,academicStream,password\nHana,Bekele,hana@mtu.edu.et,INS-ECE-01,COMPUTER_ENGINEERING,Password123!\n';
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${role === 'STUDENT' ? 'student' : 'instructor'}-import-template.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  return <section className='panel user-import-panel'>
    <div className='panel-title'>
      <div><h2>Import students or instructors</h2><p>Register account details from a CSV file or a readable-text PDF, up to 5 MB.</p></div>
      <FileUp size={22} />
    </div>
    <form className='user-import-form' onSubmit={submit}>
      <label><span>Account type</span><select value={role} onChange={(event) => setRole(event.target.value)}><option value='STUDENT'>Students</option><option value='INSTRUCTOR'>Instructors</option></select></label>
      <label><span>Department</span><select value={department} onChange={(event) => setDepartment(event.target.value)} disabled={user.role !== 'SUPER_ADMIN'} required><option value=''>Select department</option>{departments.map((item) => <option value={item._id} key={item._id}>{item.name}</option>)}</select></label>
      <label className='file-field'><span>CSV or PDF file</span><input key={fileKey} type='file' accept='.csv,.pdf,text/csv,application/pdf' onChange={(event) => setFile(event.target.files?.[0] || null)} required /></label>
      <button className='primary-action' disabled={!file || !department || busy}><FileUp size={17} />{busy ? 'Importing...' : 'Import accounts'}</button>
    </form>
    <div className='import-guidance'>
      <div className='import-guidance-heading'><strong>CSV columns</strong><button type='button' className='secondary-action compact-action' onClick={downloadTemplate}>Download CSV template</button></div><code>{columns}</code>
      <p>The MTU email is the account username used to sign in. Department may be supplied once above or in each file row. Password is optional; new accounts default to <strong>Password123!</strong>. ECE instructors require academicStream, and ECE students require yearLevel.</p>
      <details><summary>PDF record format</summary><pre>{role === 'STUDENT'
        ? 'First Name: Hana\nLast Name: Bekele\nEmail: hana@mtu.edu.et\nStudent Number: ECE-3001\nYear Level: 3\nGPA: 3.45'
        : 'First Name: Hana\nLast Name: Bekele\nEmail: hana@mtu.edu.et\nEmployee Number: INS-ECE-01\nAcademic Stream: COMPUTER_ENGINEERING'}</pre><p>Repeat the labeled block for each account. Pipe-separated or comma-separated PDF tables with a header row are also accepted.</p></details>
    </div>
    {message && <div className='success-message'>{message}</div>}
    {error && <div className='error-message'>{error}</div>}
  </section>;
}

function RegistrationReviewActions({ row, refresh }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const status = row.registrationStatus || 'APPROVED';
  if (status === 'APPROVED') return null;
  const review = async (nextStatus) => {
    setBusy(nextStatus); setError('');
    try { await reviewRegistration(row._id, nextStatus); await refresh(); }
    catch (requestError) { setError(requestError.response?.data?.message || 'Registration could not be reviewed.'); }
    finally { setBusy(''); }
  };
  return <div className='registration-review-actions'>
    <button type='button' className='verification-action approve' onClick={() => review('APPROVED')} disabled={Boolean(busy)}><CheckCircle2 size={15} />{busy === 'APPROVED' ? 'Verifying...' : 'Verify'}</button>
    {status === 'PENDING' && <button type='button' className='verification-action reject' onClick={() => review('REJECTED')} disabled={Boolean(busy)}><XCircle size={15} />{busy === 'REJECTED' ? 'Rejecting...' : 'Reject'}</button>}
    {error && <small className='review-error'>{error}</small>}
  </div>;
}

export function UsersPage() {
  const { user } = useAuth();
  const editable = canManage('users', user);
  const roles = user.role === 'SUPER_ADMIN' ? allRoles : ['INSTRUCTOR', 'STUDENT'];
  const initial = { firstName: '', lastName: '', email: '', password: '', role: 'STUDENT', committeeRoles: [], department: '', studentNumber: '', yearLevel: '', gpa: '', academicStream: '', employeeNumber: '', isActive: true };
  const [values, setValues] = useState(initial);
  const [editingId, setEditingId] = useState('');
  const [showManagedPassword, setShowManagedPassword] = useState(false);
  const [departments, setDepartments] = useState([]);
  const [userSearch, setUserSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('ALL');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const selectedUserDepartment = departments.find((department) => sameId(department, values.department));
  const isEceUser = isEceDepartment(selectedUserDepartment);
  const streamRequired = isEceUser && (values.role === 'INSTRUCTOR' || (values.role === 'STUDENT' && Number(values.yearLevel) >= 4));
  useEffect(() => { getDepartments().then((loadedDepartments) => { const availableDepartments = roleScopedDepartments(loadedDepartments, user); setDepartments(availableDepartments); setValues((current) => ({ ...current, department: current.department || availableDepartments[0]?._id || '' })); }).catch(() => setDepartments([])); }, [user]);
  const reset = () => { setValues({ ...initial, department: departments[0]?._id || '' }); setEditingId(''); setShowManagedPassword(false); };
  const save = async (refresh) => {
    const payload = { ...values };
    if (!payload.department) delete payload.department;
    if (!payload.studentNumber) delete payload.studentNumber;
    if (!payload.yearLevel) delete payload.yearLevel;
    if (payload.gpa === '') delete payload.gpa; else payload.gpa = Number(payload.gpa);
    if (!payload.academicStream) delete payload.academicStream;
    if (!payload.employeeNumber) delete payload.employeeNumber;
    if (editingId && !payload.password) delete payload.password;
    if (editingId) await updateUser(editingId, payload); else await createUser(payload);
    reset(); await refresh();
  };
  const edit = (row) => {
    setEditingId(row._id);
    setShowManagedPassword(false);
    setValues({ firstName: row.firstName || '', lastName: row.lastName || '', email: row.email || '', password: '', role: row.role || 'STUDENT', committeeRoles: row.committeeRoles || [], department: row.department?._id || '', studentNumber: row.studentNumber || '', yearLevel: row.yearLevel || '', gpa: row.gpa ?? '', academicStream: row.academicStream || '', employeeNumber: row.employeeNumber || '', isActive: row.isActive !== false });
    window.requestAnimationFrame(() => document.getElementById('user-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const normalizedSearch = userSearch.trim().toLowerCase();
  const filterUser = (row) => {
    const departmentMatches = departmentFilter === 'ALL'
      || (departmentFilter === 'UNIVERSITY' ? !row.department : sameId(row.department, departmentFilter));
    const roleMatches = roleFilter === 'ALL' || row.role === roleFilter || (row.committeeRoles || []).includes(roleFilter);
    const statusMatches = statusFilter === 'ALL' || (row.registrationStatus || 'APPROVED') === statusFilter;
    if (!departmentMatches || !roleMatches || !statusMatches) return false;
    if (!normalizedSearch) return true;
    return [
      row.firstName,
      row.lastName,
      `${row.firstName || ''} ${row.lastName || ''}`,
      row.username,
      row.email,
      row.studentNumber,
      row.employeeNumber,
      row.department?.name,
      row.department?.code,
      row.role,
      row.role?.replaceAll('_', ' '),
      ...(row.committeeRoles || []),
      ...(row.committeeRoles || []).map((role) => role.replaceAll('_', ' '))
    ].some((field) => String(field || '').toLowerCase().includes(normalizedSearch));
  };
  const filtersActive = Boolean(normalizedSearch || departmentFilter !== 'ALL' || roleFilter !== 'ALL' || statusFilter !== 'ALL');
  const clearFilters = () => { setUserSearch(''); setDepartmentFilter('ALL'); setRoleFilter('ALL'); setStatusFilter('ALL'); };
  const directoryToolbar = <div className='user-directory-toolbar' role='search' aria-label='Search and filter users'>
    <label className='user-search-field'><span>Search users</span><div><Search size={17} aria-hidden='true' /><input type='search' value={userSearch} onChange={(event) => setUserSearch(event.target.value)} placeholder='Name, email, username, or ID' /></div></label>
    <label><span>Department</span><select value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)}><option value='ALL'>All departments</option>{user.role === 'SUPER_ADMIN' && <option value='UNIVERSITY'>University-wide</option>}{departments.map((department) => <option value={department._id} key={department._id}>{department.name} ({department.code})</option>)}</select></label>
    <label><span>Role</span><select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}><option value='ALL'>All roles</option>{roles.map((role) => <option value={role} key={role}>{role.replaceAll('_', ' ')}</option>)}<option value='COURSE_EXAM_COMMITTEE'>Course and Exam Committee</option></select></label>
    <label><span>Registration</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value='ALL'>All statuses</option><option value='PENDING'>Pending verification</option><option value='APPROVED'>Approved</option><option value='REJECTED'>Rejected</option></select></label>
    <button type='button' className='secondary-action user-filter-clear' onClick={clearFilters} disabled={!filtersActive}><X size={16} />Clear filters</button>
  </div>;
  return <DataPage title='Users' subtitle={user.role === 'SUPER_ADMIN' ? 'Review registrations and manage accounts across departments.' : 'Review student and instructor registrations in your department.'} load={getUsers} canEdit={editable} onEdit={edit} filterRows={filterUser} toolbar={directoryToolbar} rowActions={(row, { refresh }) => <RegistrationReviewActions row={row} refresh={refresh} />} groupBy={(row) => row.role === 'STUDENT' ? `${row.department?.name || 'No department'} / ${studentGroupLabel(row)}` : `${row.department?.name || 'University-wide'} / Staff accounts`} form={({ refresh }) => editable && <>
    <UserImportForm user={user} departments={departments} refresh={refresh} />
    <AdminForm id='user-editor' title='User' message={editingId && user.role !== 'SUPER_ADMIN' ? 'The MTU email is the login username. Only the Super Admin can reset an existing password.' : 'The MTU email is the login username. Set an initial password or enter a new password here to reset it.'} editing={Boolean(editingId)} onCancel={reset} onSubmit={() => save(refresh)}>
    <label><span>First name</span><input value={values.firstName} onChange={(event) => setValues({ ...values, firstName: event.target.value })} required /></label>
    <label><span>Last name</span><input value={values.lastName} onChange={(event) => setValues({ ...values, lastName: event.target.value })} required /></label>
    <label className='credential-field'><span>MTU email / username</span><input type='email' value={values.email} onChange={(event) => setValues({ ...values, email: event.target.value.toLowerCase() })} pattern='.+@mtu[.]edu[.]et' title='Use an @mtu.edu.et email address' autoComplete='off' placeholder='name@mtu.edu.et' required /><small>This is the username used on the login page.</small></label>
    {(!editingId || user.role === 'SUPER_ADMIN') && <label className='credential-field managed-password-field'><span>{editingId ? 'Reset password' : 'Initial password'}</span><div className='password-input'><input type={showManagedPassword ? 'text' : 'password'} value={values.password} onChange={(event) => setValues({ ...values, password: event.target.value })} minLength='8' autoComplete='new-password' required={!editingId} placeholder={editingId ? 'Leave blank to keep current password' : 'At least 8 characters'} /><button type='button' onClick={() => setShowManagedPassword((visible) => !visible)} aria-label={showManagedPassword ? 'Hide password' : 'Show password'} title={showManagedPassword ? 'Hide password' : 'Show password'}>{showManagedPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div><div className='credential-actions'><small>{editingId ? 'Enter a new value to reset the password.' : 'Give this password securely to the user.'}</small><button type='button' className='text-action compact-action' onClick={() => { setValues((current) => ({ ...current, password: generateTemporaryPassword() })); setShowManagedPassword(true); }}><RefreshCw size={14} />Generate password</button></div></label>}
    <label><span>Role</span><select value={values.role} onChange={(event) => { const role = event.target.value; setValues({ ...values, role, studentNumber: role === 'STUDENT' ? values.studentNumber : '', yearLevel: role === 'STUDENT' ? values.yearLevel : '', gpa: role === 'STUDENT' ? values.gpa : '', employeeNumber: role === 'STUDENT' ? '' : values.employeeNumber, academicStream: isEceUser && role === 'INSTRUCTOR' ? values.academicStream : '' }); }}>{roles.map((role) => <option value={role} key={role}>{role.replaceAll('_', ' ')}</option>)}</select></label>
    <label><span>Department</span><select value={values.department} onChange={(event) => { const department = departments.find((item) => sameId(item, event.target.value)); setValues({ ...values, department: event.target.value, academicStream: isEceDepartment(department) ? values.academicStream : '' }); }} required={values.role !== 'SUPER_ADMIN'}>{values.role === 'SUPER_ADMIN' && <option value=''>University-wide</option>}{departments.map((department) => <option value={department._id} key={department._id}>{department.name}</option>)}</select></label>
    {values.role === 'STUDENT' && <label><span>Student number</span><input value={values.studentNumber} onChange={(event) => setValues({ ...values, studentNumber: event.target.value })} required placeholder='Student ID number' /></label>}
    {values.role === 'STUDENT' && <label><span>Year level</span><select value={values.yearLevel} required={isEceUser} onChange={(event) => { const yearLevel = event.target.value; setValues({ ...values, yearLevel, academicStream: Number(yearLevel) >= 4 ? values.academicStream : '' }); }}><option value=''>Not specified</option>{[2, 3, 4, 5].map((year) => <option value={year} key={year}>Year {year}</option>)}</select></label>}
    {values.role === 'STUDENT' && <label><span>GPA</span><input type='number' min='0' max='4' step='0.01' value={values.gpa} onChange={(event) => setValues({ ...values, gpa: event.target.value })} placeholder='Required for stream allocation' /></label>}
    {streamRequired && <label><span>Branch / stream</span><select value={values.academicStream} onChange={(event) => setValues({ ...values, academicStream: event.target.value })} required><option value='' disabled>Select one stream</option>{academicStreams.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>}
    {values.role !== 'STUDENT' && <label><span>Employee number</span><input value={values.employeeNumber} onChange={(event) => setValues({ ...values, employeeNumber: event.target.value })} placeholder='Staff ID number' /></label>}
    {values.role === 'INSTRUCTOR' && values.committeeRoles.includes('COURSE_EXAM_COMMITTEE') && <div className='role-panel'><strong>Course and Exam Committee member</strong><p>This unified duty is controlled only by the HOD's three-member semester committee appointment.</p></div>}
    <label className='checkbox-field'><input type='checkbox' checked={values.isActive} onChange={(event) => setValues({ ...values, isActive: event.target.checked })} />Active account</label>
    </AdminForm>
  </>} columns={[
    { label: 'Name', value: (row) => row.firstName + ' ' + row.lastName },
    { label: 'Login email', value: (row) => row.email },
    { label: 'Role / Duties', value: (row) => [row.role.replaceAll('_', ' '), ...(row.committeeRoles || []).map((role) => role.replaceAll('_', ' '))].join(' / ') },
    { label: 'Department / Cohort', value: (row) => `${row.department?.name || 'University-wide'}${row.role === 'STUDENT' ? ` / ${studentGroupLabel(row)}${typeof row.gpa === 'number' ? ` / GPA ${row.gpa.toFixed(2)}` : ''}` : row.academicStream ? ` / ${streamLabel(row.academicStream)}` : ''}` },
    { label: 'Registration', value: (row) => (row.registrationStatus || 'APPROVED').replaceAll('_', ' ') }
  ]} />;
}
