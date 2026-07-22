import { useCallback, useEffect, useState } from 'react';
import { Bell, BookOpenCheck, ClipboardCheck, FileCheck2, UsersRound } from 'lucide-react';
import { createNotification, getDashboardSummary, getDepartments, getInstructorDashboard, getStudentEvaluationStatus, getUsers } from '../api/client.js';
import { StatCard } from '../components/StatCard.jsx';
import { groupStudents, streamLabel } from '../utils/academicStreams.js';
import { AnalyticsCharts } from '../components/Charts.jsx';
import { EvaluationForm, StaffEvaluationForm } from '../components/EvaluationForm.jsx';

export function DashboardHome({ user }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setError('');
    try {
      if (user.role === 'STUDENT') setData(await getStudentEvaluationStatus());
      else if (user.role === 'INSTRUCTOR') setData(await getInstructorDashboard());
      else setData(await getDashboardSummary());
    } catch (requestError) { setError(requestError.response?.data?.message || 'Dashboard data could not be loaded.'); }
  }, [user.role]);
  useEffect(() => { load(); }, [load]);

  if (error) return <div className='error-message'>{error}</div>;
  if (!data) return <div className='loading-state'>Loading live dashboard data...</div>;
  if (user.role === 'STUDENT') return <EvaluationForm courses={data.courses} onSubmitted={load} />;
  if (user.role === 'INSTRUCTOR') return <InstructorHome data={data} onSubmitted={load} />;
  return <AdminHome data={data} user={user} onSubmitted={load} />;
}

function AdminHome({ data, user, onSubmitted }) {
  return <>
    <div className='stats-grid'>
      <StatCard label='Departments' value={data.totals.departments} helper='Active academic units' />
      <StatCard label='Courses' value={data.totals.courses} helper='Stored in MongoDB' tone='teal' />
      <StatCard label='Students' value={data.totals.students} helper='Eligible evaluators' tone='amber' />
      <StatCard label='Completion' value={data.evaluationCompletion + '%'} helper={data.pendingEvaluations + ' pending'} tone='rose' />
    </div>
    <AnalyticsCharts scores={data.averageScores} />
    {user.role === 'HOD' && <StaffEvaluationForm kind='HOD' title='Department Head Performance Evaluation' onSubmitted={onSubmitted} />}
    {user.role === 'HOD' && <NotificationList notifications={data.notifications || []} title='Administrator notifications' description='University, department, and direct announcements sent by the administrator.' />}
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
        const loadedRecipients = loadedUsers.filter((item) => item.role === 'INSTRUCTOR' || (isAdmin && item.role === 'HOD'));
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
    <div className='panel-title'><div><h2><Bell size={20} /> Staff notifications</h2><p className='template-meta'>Send an announcement to an HOD, instructor, department, or the university.</p></div></div>
    <form onSubmit={submit}>
      <label><span>Audience</span><select value={values.audience} onChange={(event) => setValues({ ...values, audience: event.target.value })}>{isAdmin && <option value='UNIVERSITY'>All university staff</option>}<option value='DEPARTMENT'>{isAdmin ? 'One department' : 'My department'}</option><option value='USER'>One staff member</option></select></label>
      {values.audience === 'DEPARTMENT' && isAdmin && <label><span>Department</span><select value={values.department} onChange={(event) => setValues({ ...values, department: event.target.value })}>{departments.map((department) => <option value={department._id} key={department._id}>{department.name}</option>)}</select></label>}
      {values.audience === 'USER' && <label><span>Staff recipient</span><select value={values.user} onChange={(event) => setValues({ ...values, user: event.target.value })}>{recipients.map((recipient) => <option value={recipient._id} key={recipient._id}>{recipient.firstName} {recipient.lastName} ({recipient.role.replaceAll('_', ' ')})</option>)}</select></label>}
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
  const report = data.finalReport;
  return <>
    <div className='stats-grid'>
      <StatCard label='Courses' value={data.assignments.length} helper='Assigned courses' />
      <StatCard label='Students' value={data.enrolledStudents} helper='Enrolled students' tone='teal' />
      <StatCard label='Peer tasks' value={data.peerTasks.length} helper='Assigned and pending' tone='amber' />
      <StatCard label='Final report' value={report ? report.overallScore : 'Pending'} helper={report ? 'Published score' : 'Awaiting HOD or committee'} tone='rose' />
    </div>
    <section className='panel instructor-section'>
      <div className='panel-title'><div><h2><BookOpenCheck size={20} /> Assigned courses and students</h2><p className='template-meta'>Only courses and student rosters assigned to your instructor account are shown.</p></div><span>{data.assignments.length} courses</span></div>
      {data.assignments.length ? <div className='course-roster-grid'>{data.assignments.map((assignment) => <article className='course-roster-card' key={assignment._id}>
        <div className='course-roster-heading'>
          <div><strong>{assignment.course?.code} - {assignment.course?.title}</strong><span>{assignment.course?.yearLevel ? `Year ${assignment.course.yearLevel}` : assignment.course?.level || 'Class not specified'}{assignment.course?.academicStream ? ` / ${streamLabel(assignment.course.academicStream)}` : ''} / {assignment.semester?.name} {assignment.semester?.academicYear}</span></div>
          <em>{assignment.status}</em>
        </div>
        <div className='roster-title'><UsersRound size={16} /><strong>Assigned students ({assignment.enrolledStudents?.length || 0})</strong></div>
        {assignment.enrolledStudents?.length ? <div className='student-roster grouped-roster'>{groupStudents(assignment.enrolledStudents).map(([label, students]) => <section className='student-group' key={label}><strong>{label} ({students.length})</strong>{students.map((student) => <div key={student._id}>
          <span>{student.firstName} {student.lastName}</span>
          <small>{student.studentNumber || 'No student number'} / {student.email}</small>
        </div>)}</section>)}</div> : <p className='muted-copy'>No students are assigned to this course.</p>}
      </article>)}</div> : <div className='empty-state'>No courses are assigned to your account yet.</div>}
    </section>
    <section className='instructor-section'>
      <div className='section-heading'><ClipboardCheck size={20} /><div><h2>Assigned peer evaluation tasks</h2><p>Only instructors explicitly assigned to you for peer review are available.</p></div><span>{data.peerTasks.length} pending</span></div>
      <StaffEvaluationForm kind='PEER' title='Peer Performance Evaluation' onSubmitted={onSubmitted} />
    </section>
    <section className='panel instructor-section'>
      <div className='panel-title'><div><h2><FileCheck2 size={20} /> My evaluation report</h2><p className='template-meta'>Your own evaluation results and the final summary published by your HOD or Exam Committee.</p></div><span>{report ? 'Final' : 'Not published'}</span></div>
      <div className='report-summary'>
        <div><small>Live overall</small><strong>{data.scores.overall}</strong></div>
        <div><small>Student</small><strong>{report?.sourceScores?.student ?? data.scores.studentScore}</strong></div>
        <div><small>Peer</small><strong>{report?.sourceScores?.peer ?? data.scores.peerScore}</strong></div>
        <div><small>HOD</small><strong>{report?.sourceScores?.hod ?? data.scores.hodScore}</strong></div>
        <div><small>Student completion</small><strong>{data.completionPercentage}%</strong></div>
        <div><small>Semester</small><strong>{report?.semester ? `${report.semester.name} ${report.semester.academicYear}` : 'Current'}</strong></div>
      </div>
      {report ? <>
        <div className='final-summary'>
          <span>Final summary</span>
          <p>{report.finalSummary}</p>
          <small>Published by {report.publishedBy ? `${report.publishedBy.firstName} ${report.publishedBy.lastName} (${report.publishedBy.role.replaceAll('_', ' ')})` : 'the department'} on {report.publishedAt ? new Date(report.publishedAt).toLocaleDateString() : 'the latest review date'}.</small>
        </div>
        {report.recommendations?.length > 0 && <div className='recommendation-list'><strong>Recommendations</strong>{report.recommendations.map((item) => <p key={item}>{item}</p>)}</div>}
      </> : <div className='empty-state'>Your live scores will remain visible here. The signed final summary will appear after your HOD or Exam Committee publishes it.</div>}
      <AnalyticsCharts scores={data.radar} />
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
