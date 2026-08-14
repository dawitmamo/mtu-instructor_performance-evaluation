import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL || '/api';
export const api = axios.create({ baseURL, timeout: 15000 });
const refreshClient = axios.create({ baseURL, timeout: 15000 });
const publicAuthPaths = ['/auth/login', '/auth/signup', '/auth/departments', '/auth/forgot-password', '/auth/reset-password'];
const accessTokenKey = 'accessToken';
const refreshTokenKey = 'refreshToken';

function isPublicAuthRequest(url = '') {
  return publicAuthPaths.some((path) => url.includes(path));
}

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem(accessTokenKey);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(undefined, async (error) => {
  const request = error.config;
  const refreshToken = sessionStorage.getItem(refreshTokenKey);
  if (error.response?.status === 401 && refreshToken && !request?._retried && !isPublicAuthRequest(request?.url)) {
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
  localStorage.removeItem(accessTokenKey);
  localStorage.removeItem(refreshTokenKey);
  sessionStorage.setItem(accessTokenKey, data.accessToken);
  sessionStorage.setItem(refreshTokenKey, data.refreshToken);
}
export function clearSession() {
  sessionStorage.removeItem(accessTokenKey);
  sessionStorage.removeItem(refreshTokenKey);
  localStorage.removeItem(accessTokenKey);
  localStorage.removeItem(refreshTokenKey);
}
export function hasSession() { return Boolean(sessionStorage.getItem(accessTokenKey)); }
export function clearLegacySharedSession() {
  localStorage.removeItem(accessTokenKey);
  localStorage.removeItem(refreshTokenKey);
}
export async function login(identifier, password, userType, department) {
  const normalized = identifier.trim().toLowerCase();
  const credential = normalized.includes('@') ? { email: normalized } : { username: normalized };
  const { data } = await api.post('/auth/login', { ...credential, password, userType, department });
  saveSession(data);
  return data;
}
export async function getLoginDepartments() { return (await api.get('/auth/departments')).data.departments; }
export async function signup(payload) { return (await api.post('/auth/signup', payload)).data; }
export async function changePassword(currentPassword, newPassword) {
  const { data } = await api.post('/auth/change-password', { currentPassword, newPassword });
  saveSession(data);
  return data;
}
export async function requestPasswordReset(email) { return (await api.post('/auth/forgot-password', { email })).data; }
export async function resetPassword(token, newPassword) { return (await api.post('/auth/reset-password', { token, newPassword })).data; }
export async function updateProfile(payload) { return (await api.put('/auth/profile', payload)).data; }
export async function uploadProfilePhoto(file) {
  const form = new FormData();
  form.append('photo', file);
  return (await api.post('/auth/profile/photo', form)).data;
}
export async function deleteProfilePhoto() { return (await api.delete('/auth/profile/photo')).data; }
export async function getProfilePhoto(userId) { return (await api.get(`/auth/profile/photo/${userId}`, { responseType: 'blob' })).data; }
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
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
export async function getStudentEvaluationStatus() { return (await api.get('/evaluations/student/status')).data; }
export async function getEvaluationTemplate(kind) { return (await api.get(`/evaluation-templates/${kind}`)).data.template; }
export async function saveHodEvaluationTemplate(payload) { return (await api.post('/evaluation-templates/hod', payload)).data; }
export async function getEvaluationTargets(kind) { return (await api.get(`/evaluations/targets/${kind}`)).data.targets; }
export async function getDepartments() { return (await api.get('/departments')).data.departments; }
export async function getSemesters() { return (await api.get('/semesters')).data.semesters; }
export async function createDepartment(payload) { return (await api.post('/departments', payload)).data.department; }
export async function createSemester(payload) { return (await api.post('/semesters', payload)).data.semester; }
export async function createCourse(payload) { return (await api.post('/courses', payload)).data.course; }
export async function createAssignment(payload) { return (await api.post('/assignments', payload)).data.assignment; }
export async function createUser(payload) { return (await api.post('/auth/register', payload)).data; }
export async function updateDepartment(id, payload) { return (await api.put(`/departments/${id}`, payload)).data.department; }
export async function updateSemester(id, payload) { return (await api.put(`/semesters/${id}`, payload)).data.semester; }
export async function updateCourse(id, payload) { return (await api.put(`/courses/${id}`, payload)).data.course; }
export async function updateAssignment(id, payload) { return (await api.put(`/assignments/${id}`, payload)).data.assignment; }
export async function updateUser(id, payload) { return (await api.put(`/users/${id}`, payload)).data.user; }
export async function reviewRegistration(id, status) { return (await api.patch(`/users/${id}/registration`, { status })).data; }
export async function resendSetupLink(id) { return (await api.post(`/users/${id}/setup-link`)).data; }
export async function getCourses() { return (await api.get('/courses')).data.courses; }
export async function getAssignments() { return (await api.get('/assignments')).data.assignments; }
export async function getUsers(role) { return (await api.get('/users', { params: role ? { role } : {} })).data.users; }
export async function getExamCommittees(department) { return (await api.get('/exam-committees', { params: department ? { department } : {} })).data.committees; }
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
export async function getInstructorCoursePreferences() { return (await api.get('/course-preferences/instructor')).data; }
export async function submitCoursePreference(payload) { return (await api.post('/course-preferences', payload)).data; }
export async function getCoursePreferenceManagement(semester) { return (await api.get('/course-preferences/manage', { params: semester ? { semester } : {} })).data; }
export async function recommendCoursePreference(preferenceId, course, note) { return (await api.post(`/course-preferences/${preferenceId}/recommend`, { course, note })).data; }
export async function finalizeCoursePreference(preferenceId, course, note) { return (await api.post(`/course-preferences/${preferenceId}/finalize`, { course, note })).data; }
export async function resetCourseAllocations(semester) { return (await api.post('/course-preferences/reset', { semester })).data; }
export async function submitStudentEvaluation(payload) { return (await api.post('/evaluations/student', payload)).data; }
export async function submitPeerEvaluation(payload) { return (await api.post('/evaluations/peer', payload)).data; }
export async function submitHodEvaluation(payload) { return (await api.post('/evaluations/hod', payload)).data; }
export async function getInstructorReport(instructorId, semester, assignment) {
  return (await api.get(`/reports/instructor/${instructorId}`, { params: { ...(semester ? { semester } : {}), ...(assignment ? { assignment } : {}) } })).data;
}
export async function publishInstructorReport(instructorId, finalSummary, semester, assignment) {
  return (await api.post(`/reports/instructor/${instructorId}/publish`, { finalSummary }, { params: { ...(semester ? { semester } : {}), ...(assignment ? { assignment } : {}) } })).data;
}

export async function downloadReport(instructorId, format, semester, assignment) {
  const endpoint = format === 'pdf' ? 'pdf' : 'excel';
  const response = await api.get(`/reports/instructor/${instructorId}/${endpoint}`, {
    params: { ...(semester ? { semester } : {}), ...(assignment ? { assignment } : {}) },
    responseType: 'blob'
  });
  const url = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = `instructor-evaluation.${format === 'pdf' ? 'pdf' : 'csv'}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
