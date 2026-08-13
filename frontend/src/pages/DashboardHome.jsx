import { useCallback, useEffect, useState } from 'react';
import { Bell, BookOpenCheck, ClipboardCheck, FileCheck2, UsersRound } from 'lucide-react';
import { createNotification, getDashboardSummary, getDepartments, getInstructorDashboard, getStudentEvaluationStatus, getUsers } from '../api/client.js';
import { StatCard } from '../components/StatCard.jsx';
import { groupStudents, streamLabel } from '../utils/academicStreams.js';
import { AnalyticsCharts } from '../components/Charts.jsx';
import { EvaluationForm, StaffEvaluationForm } from '../components/EvaluationForm.jsx';

export function DashboardHome({ user }) {
  const committeeMember = (user.committeeRoles || []).includes('COURSE_EXAM_COMMITTEE');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setError('');
    try {
      if (user.role === 'STUDENT') setData(await getStudentEvaluationStatus());
      else if (user.role === 'INSTRUCTOR' && !committeeMember) setData(await getInstructorDashboard());
      else setData(await getDashboardSummary());
    } catch (requestError) { setError(requestError.response?.data?.message || 'Dashboard data could not be loaded.'); }
  }, [user.role, committeeMember]);
  useEffect(() => { load(); }, [load]);

  if (error) return <div className='error-message'>{error}</div>;
  if (!data) return <div className='loading-state'>Loading live dashboard data...</div>;
  if (user.role === 'STUDENT') return <>
    <EvaluationForm courses={data.courses} onSubmitted={load} />
    <NotificationList notifications={data.notifications || []} title='Evaluation notifications' description='Evaluation requests from your HOD or Course and Exam Committee identify the instructor and course.' />
  </>;
  if (user.role === 'INSTRUCTOR' && !committeeMember) return <InstructorHome data={data} onSubmitted={load} />;
  return <AdminHome data={data} user={user} onSubmitted={load} />;
}

function AdminHome({ data, user, onSubmitted }) {
  const committeeMember = (user.committeeRoles || []).includes('COURSE_EXAM_COMMITTEE');
  return <>
    <div className='stats-grid'>
      <StatCard label='Departments' value={data.totals.departments} helper='Active academic units' />
      <StatCard label='Courses' value={data.totals.courses} helper='Available course data' tone='teal' />
      <StatCard label='Students' value={data.totals.students} helper='Eligible evaluators' tone='amber' />
      <StatCard label='Completion' value={data.evaluationCompletion + '%'} helper={data.pendingEvaluations + ' pending'} tone='rose' />
    </div>
    <AnalyticsCharts scores={data.averageScores} />
    {user.role === 'HOD' && <StaffEvaluationForm kind='HOD' title='Department Head Performance Evaluation' onSubmitted={onSubmitted} />}
    {committeeMember && <StaffEvaluationForm kind='PEER' title='Assigned Peer Performance Evaluations' onSubmitted={onSubmitted} />}
    {(user.role === 'HOD' || committeeMember) && <NotificationList notifications={data.notifications || []} title='Department notifications' description='University, department, and direct announcements available to your role.' />}
    <NotificationComposer user={user} />
  </>;
}

function NotificationComposer({ user }) {
  const isAdmin = user.role === 'SUPER_ADMIN';
  const [recipients, setRecipients] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [values, setValues] = useState({ audience: isAdmin ? 'UNIVERSITY' : 'DEPARTMENT', user: '', department: '', title: '', message: '', type: 'INFO' });
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    Promise.all([getUsers(), getDepartments()])
      .then(([loadedUsers, loadedDepartments]) => {
        const loadedRecipients = loadedUsers.filter((item) => ['INSTRUCTOR', 'STUDENT'].includes(item.role) || (isAdmin && item.role === 'HOD'));
        setRecipients(loadedRecipients);
        setDepartments(loadedDepartments);
        setValues((current) => ({ ...current, user: current.user || loadedRecipients[0]?._id || '', department: current.department || loadedDepartments[0]?._id || '' }));
      })
      .catch(() => {});
  }, []);
  const submit = async (event) => {
    event.preventDefault(); setError(''); setStatus('');
    try {
      const payload = { title: values.title, message: values.message, type: values.type, audience: values.audience };
      if (values.audience === 'USER') payload.user = values.user;
      if (values.audience === 'DEPARTMENT' && isAdmin) payload.department = values.department;
      const result = await createNotification(payload);
      setStatus(result.message);
      setValues((current) => ({ ...current, title: '', message: '' }));
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Notification could not be published.');
    }
  };
  return <section className='panel notification-composer'>
    <div className='panel-title'><div><h2><Bell size={20} /> Email and in-app notifications</h2><p className='template-meta'>Send an announcement to a student, instructor, HOD, department, or the university. Email is queued automatically.</p></div></div>
    <form onSubmit={submit}>
      <label><span>Audience</span><select value={values.audience} onChange={(event) => setValues({ ...values, audience: event.target.value })}>{isAdmin && <option value='UNIVERSITY'>All students and instructors</option>}<option value='DEPARTMENT'>{isAdmin ? 'One department' : 'My department students and instructors'}</option><option value='USER'>One person</option></select></label>
      {values.audience === 'DEPARTMENT' && isAdmin && <label><span>Department</span><select value={values.department} onChange={(event) => setValues({ ...values, department: event.target.value })}>{departments.map((department) => <option value={department._id} key={department._id}>{department.name}</option>)}</select></label>}
      {values.audience === 'USER' && <label><span>Recipient</span><select value={values.user} onChange={(event) => setValues({ ...values, user: event.target.value })}>{recipients.map((recipient) => <option value={recipient._id} key={recipient._id}>{recipient.firstName} {recipient.lastName} ({recipient.role.replaceAll('_', ' ')})</option>)}</select></label>}
      <label><span>Type</span><select value={values.type} onChange={(event) => setValues({ ...values, type: event.target.value })}><option value='INFO'>Information</option><option value='REMINDER'>Reminder</option><option value='DEADLINE'>Deadline</option></select></label>
      <label><span>Title</span><input value={values.title} onChange={(event) => setValues({ ...values, title: event.target.value })} minLength={3} maxLength={150} required /></label>
      <label className='notification-message'><span>Message</span><textarea value={values.message} onChange={(event) => setValues({ ...values, message: event.target.value })} minLength={5} maxLength={2000} required /></label>
      <button className='primary-action'><Bell size={17} /> Publish notification</button>
    </form>
    {status && <div className='success-message'>{status}</div>}
    {error && <div className='error-message'>{error}</div>}
  </section>;
}

function InstructorHome({ data, onSubmitted }) {
  const courseReports = data.courseReports || [];
  const [selectedAssignmentId, setSelectedAssignmentId] = useState(courseReports[0]?.assignment?._id || '');
  useEffect(() => {
    if (!courseReports.some((item) => item.assignment?._id === selectedAssignmentId)) setSelectedAssignmentId(courseReports[0]?.assignment?._id || '');
  }, [courseReports, selectedAssignmentId]);
  const selectedCourseReport = courseReports.find((item) => item.assignment?._id === selectedAssignmentId) || courseReports[0];
  const report = selectedCourseReport?.finalReport;
  const liveScores = selectedCourseReport?.scores || data.scores;
  const studentScore = report?.sourceScores?.student ?? liveScores.studentScore;
  const peerScore = report?.sourceScores?.peer ?? liveScores.peerScore;
  const hodScore = report?.sourceScores?.hod ?? liveScores.hodScore;
  const studentWeighted = report?.weightedContributions?.student ?? liveScores.studentWeighted;
  const peerWeighted = report?.weightedContributions?.peer ?? liveScores.peerWeighted;
  const hodWeighted = report?.weightedContributions?.hod ?? liveScores.hodWeighted;
  return <>
    <div className='stats-grid'>
      <StatCard label='Courses' value={data.assignments.length} helper='Assigned courses' />
      <StatCard label='Students' value={data.enrolledStudents} helper='Enrolled students' tone='teal' />
      <StatCard label='Peer tasks' value={data.peerTasks.length} helper='Assigned and pending' tone='amber' />
      <StatCard label='Published reports' value={(data.finalReports || []).length} helper={`${courseReports.length} assigned course${courseReports.length === 1 ? '' : 's'}`} tone='rose' />
    </div>
    <section className='panel instructor-section'>
      <div className='panel-title'><div><h2><UsersRound size={20} /> My students and streams</h2><p className='template-meta'>A single roster of students assigned to your courses, grouped by year and academic stream.</p></div><span>{(data.assignedStudents || []).length} students</span></div>
      {(data.assignedStudents || []).length ? <div className='student-roster grouped-roster'>{groupStudents(data.assignedStudents).map(([label, students]) => <details className='student-group' key={label}><summary><span>{label}</span><small>{students.length} student{students.length === 1 ? '' : 's'}</small></summary><div className='student-group-list'>{students.map((student) => <div key={student._id}>
        <span>{student.firstName} {student.lastName}</span>
        <small>{student.studentNumber || 'No student number'} / {student.email} / {student.academicStream ? streamLabel(student.academicStream) : 'General program'} / {(student.courses || []).map((course) => course.code).join(', ') || 'Assigned course'}</small>
      </div>)}</div></details>)}</div> : <div className='empty-state'>No students are assigned to your courses yet.</div>}
    </section>
    <section className='panel instructor-section'>
      <div className='panel-title'><div><h2><BookOpenCheck size={20} /> Assigned courses and students</h2><p className='template-meta'>Only courses and student rosters assigned to your instructor account are shown.</p></div><span>{data.assignments.length} courses</span></div>
      {data.assignments.length ? <div className='course-roster-grid'>{data.assignments.map((assignment) => <article className='course-roster-card' key={assignment._id}>
        <div className='course-roster-heading'>
          <div><strong>{assignment.course?.code} - {assignment.course?.title}</strong><span>{assignment.course?.yearLevel ? `Year ${assignment.course.yearLevel}` : assignment.course?.level || 'Class not specified'}{assignment.course?.academicStream ? ` / ${streamLabel(assignment.course.academicStream)}` : ''} / {assignment.semester?.name} {assignment.semester?.academicYear}</span></div>
          <em>{assignment.status}</em>
        </div>
        <div className='roster-title'><UsersRound size={16} /><strong>Assigned students ({assignment.enrolledStudents?.length || 0})</strong></div>
        {assignment.enrolledStudents?.length ? <div className='student-roster grouped-roster'>{groupStudents(assignment.enrolledStudents).map(([label, students]) => <details className='student-group' key={label}><summary><span>{label}</span><small>{students.length} student{students.length === 1 ? '' : 's'}</small></summary><div className='student-group-list'>{students.map((student) => <div key={student._id}>
          <span>{student.firstName} {student.lastName}</span>
          <small>{student.studentNumber || 'No student number'} / {student.email}</small>
        </div>)}</div></details>)}</div> : <p className='muted-copy'>No students are assigned to this course.</p>}
      </article>)}</div> : <div className='empty-state'>No courses are assigned to your account yet.</div>}
    </section>
    <section className='instructor-section'>
      <div className='section-heading'><ClipboardCheck size={20} /><div><h2>Assigned peer evaluation tasks</h2><p>Only instructors explicitly assigned to you for peer review are available.</p></div><span>{data.peerTasks.length} pending</span></div>
      <StaffEvaluationForm kind='PEER' title='Peer Performance Evaluation' onSubmitted={onSubmitted} />
    </section>
    <section className='panel instructor-section'>
      <div className='panel-title'><div><h2><FileCheck2 size={20} /> My course evaluation report</h2><p className='template-meta'>Select one course to view only its evaluation results and published final summary.</p></div><span>{report ? 'Final' : 'Not published'}</span></div>
      {courseReports.length > 0 && <div className='report-filters'><label className='report-select'><span>Course report</span><select value={selectedAssignmentId} onChange={(event) => setSelectedAssignmentId(event.target.value)}>{courseReports.map((item) => <option value={item.assignment?._id} key={item.assignment?._id}>{item.course?.code} - {item.course?.title} / {item.semester?.name} {item.semester?.academicYear}</option>)}</select></label></div>}
      <div className='report-summary'>
        <div><small>Instructor</small><strong>{report?.instructor ? `${report.instructor.firstName} ${report.instructor.lastName}` : `${data.instructor.firstName} ${data.instructor.lastName}`}</strong></div>
        <div><small>Course</small><strong>{selectedCourseReport?.course ? `${selectedCourseReport.course.code} - ${selectedCourseReport.course.title}` : 'No assigned course'}</strong></div>
        <div><small>Final result</small><strong>{report?.overallScore ?? liveScores.overall}%</strong></div>
        <div><small>Student 40%</small><strong>{studentScore} / 5 × 40% = {studentWeighted}%</strong></div>
        <div><small>Peer 30%</small><strong>{peerScore} / 5 × 30% = {peerWeighted}%</strong></div>
        <div><small>HOD 30%</small><strong>{hodScore} / 5 × 30% = {hodWeighted}%</strong></div>
        <div><small>Student completion</small><strong>{selectedCourseReport?.studentCompletionPercentage ?? 0}%</strong></div>
        <div><small>Semester</small><strong>{selectedCourseReport?.semester ? `${selectedCourseReport.semester.name} ${selectedCourseReport.semester.academicYear}` : 'Current'}</strong></div>
      </div>
      {report ? <>
        <div className='final-summary'>
          <span>Final summary</span>
          <p>{report.finalSummary}</p>
          <small>Published by {report.publishedBy ? `${report.publishedBy.firstName} ${report.publishedBy.lastName} (${report.publishedBy.role.replaceAll('_', ' ')})` : 'the department'} on {report.publishedAt ? new Date(report.publishedAt).toLocaleDateString() : 'the latest review date'}.</small>
        </div>
        {report.recommendations?.length > 0 && <div className='recommendation-list'><strong>Recommendations</strong>{report.recommendations.map((item) => <p key={item}>{item}</p>)}</div>}
      </> : <div className='empty-state'>Your live scores will remain visible here. The signed final summary will appear after your HOD or Course and Exam Committee publishes it.</div>}
      <AnalyticsCharts scores={selectedCourseReport?.radar || []} />
    </section>
    <NotificationList notifications={data.notifications} title='Notifications' description='Messages addressed to you by your department or the university.' />
  </>;
}

function NotificationList({ notifications, title, description }) {
  return <section className='panel instructor-section'>
    <div className='panel-title'><div><h2><Bell size={20} /> {title}</h2><p className='template-meta'>{description}</p></div><span>{notifications.length} messages</span></div>
    {notifications.length ? <div className='notification-list'>{notifications.map((notification) => <article key={notification._id} className={notification.readAt ? 'notification-item read' : 'notification-item'}>
      <div><strong>{notification.title}</strong><span>{notification.type}</span></div>
      <p>{notification.message}</p>
      <small>{notification.sender ? `${notification.sender.firstName} ${notification.sender.lastName} / ${notification.sender.role.replaceAll('_', ' ')}` : notification.audience === 'UNIVERSITY' ? 'University announcement' : 'Department announcement'} / {new Date(notification.createdAt).toLocaleDateString()}</small>
    </article>)}</div> : <div className='empty-state'>No matching notifications yet.</div>}
  </section>;
}
