import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL || '/api';
export const api = axios.create({ baseURL, timeout: 15000 });
const refreshClient = axios.create({ baseURL, timeout: 15000 });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(undefined, async (error) => {
  const request = error.config;
  const refreshToken = localStorage.getItem('refreshToken');
  if (error.response?.status === 401 && refreshToken && !request?._retried && !request?.url?.includes('/auth/')) {
    request._retried = true;
    try {
      const { data } = await refreshClient.post('/auth/refresh', { refreshToken });
      saveSession(data);
      request.headers.Authorization = `Bearer ${data.accessToken}`;
      return api(request);
    } catch {
      clearSession();
      window.dispatchEvent(new Event('session-expired'));
    }
  }
  return Promise.reject(error);
});

export function saveSession(data) {
  localStorage.setItem('accessToken', data.accessToken);
  localStorage.setItem('refreshToken', data.refreshToken);
}
export function clearSession() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
}
export async function login(email, password) {
  const { data } = await api.post('/auth/login', { email, password });
  saveSession(data);
  return data;
}
export async function getCurrentUser() { return (await api.get('/auth/me')).data.user; }
export async function getHealth() { return (await api.get('/health')).data; }
export async function getDashboardSummary() { return (await api.get('/dashboard/summary')).data; }
export async function getInstructorDashboard() { return (await api.get('/dashboard/instructor')).data; }
export async function createNotification(payload) { return (await api.post('/notifications', payload)).data; }
export async function getSchedules() { return (await api.get('/schedules')).data.schedules; }
export async function createSchedule(payload, file) {
  const form = new FormData();
  Object.entries(payload).forEach(([key, value]) => { if (value !== undefined && value !== null) form.append(key, value); });
  if (file) form.append('file', file);
  return (await api.post('/schedules', form)).data.schedule;
}
export async function downloadScheduleFile(id, fileName = 'schedule') {
  const response = await api.get(`/schedules/${id}/file`, { responseType: 'blob' });
  const url = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
export async function getStudentEvaluationStatus() { return (await api.get('/evaluations/student/status')).data; }
export async function getEvaluationTemplate(kind) { return (await api.get(`/evaluation-templates/${kind}`)).data.template; }
export async function getEvaluationTargets(kind) { return (await api.get(`/evaluations/targets/${kind}`)).data.targets; }
export async function getDepartments() { return (await api.get('/departments')).data.departments; }
export async function getSemesters() { return (await api.get('/semesters')).data.semesters; }
export async function createDepartment(payload) { return (await api.post('/departments', payload)).data.department; }
export async function createSemester(payload) { return (await api.post('/semesters', payload)).data.semester; }
export async function createCourse(payload) { return (await api.post('/courses', payload)).data.course; }
export async function createAssignment(payload) { return (await api.post('/assignments', payload)).data.assignment; }
export async function createUser(payload) { return (await api.post('/auth/register', payload)).data.user; }
export async function updateDepartment(id, payload) { return (await api.put(`/departments/${id}`, payload)).data.department; }
export async function updateSemester(id, payload) { return (await api.put(`/semesters/${id}`, payload)).data.semester; }
export async function updateCourse(id, payload) { return (await api.put(`/courses/${id}`, payload)).data.course; }
export async function updateAssignment(id, payload) { return (await api.put(`/assignments/${id}`, payload)).data.assignment; }
export async function updateUser(id, payload) { return (await api.put(`/users/${id}`, payload)).data.user; }
export async function getCourses() { return (await api.get('/courses')).data.courses; }
export async function getAssignments() { return (await api.get('/assignments')).data.assignments; }
export async function getUsers(role) { return (await api.get('/users', { params: role ? { role } : {} })).data.users; }
export async function getExamCommittees() { return (await api.get('/exam-committees')).data.committees; }
export async function saveExamCommittee(payload) { return (await api.post('/exam-committees', payload)).data.committee; }
export async function importUsersFile(file, role, department) {
  const form = new FormData();
  form.append('file', file);
  form.append('role', role);
  if (department) form.append('department', department);
  return (await api.post('/uploads/users', form)).data;
}
export async function getStudentStreamSelection() { return (await api.get('/stream-selection/student')).data; }
export async function submitStreamPreferences(payload) { return (await api.post('/stream-selection/preferences', payload)).data.preference; }
export async function getStreamSelectionManagement() { return (await api.get('/stream-selection/manage')).data; }
export async function saveStreamSelectionRound(payload) { return (await api.post('/stream-selection/rounds', payload)).data.round; }
export async function allocateStreamSelection(roundId) { return (await api.post(`/stream-selection/rounds/${roundId}/allocate`)).data; }
export async function generateKeys(payload) { return (await api.post('/evaluation-keys/generate', payload)).data.keys; }
export async function submitStudentEvaluation(payload) { return (await api.post('/evaluations/student', payload)).data; }
export async function submitPeerEvaluation(payload) { return (await api.post('/evaluations/peer', payload)).data; }
export async function submitHodEvaluation(payload) { return (await api.post('/evaluations/hod', payload)).data; }
export async function getInstructorReport(instructorId) { return (await api.get(`/reports/instructor/${instructorId}`)).data; }
export async function publishInstructorReport(instructorId, finalSummary) { return (await api.post(`/reports/instructor/${instructorId}/publish`, { finalSummary })).data; }

export async function downloadReport(instructorId, format) {
  const endpoint = format === 'pdf' ? 'pdf' : 'excel';
  const response = await api.get(`/reports/instructor/${instructorId}/${endpoint}`, { responseType: 'blob' });
  const url = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = `instructor-evaluation.${format === 'pdf' ? 'pdf' : 'csv'}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
