import { Department } from '../models/Department.js';

function profileError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

async function departmentCode(department) {
  if (!department) return null;
  const record = await Department.findById(department).select('code');
  if (!record) throw profileError('Department not found');
  return record.code;
}

export async function validateUserAcademicProfile({ role, department, yearLevel, gpa, academicStream }) {
  const code = await departmentCode(department);
  if (role !== 'STUDENT' && (yearLevel !== undefined || gpa !== undefined)) {
    throw profileError('Year level and GPA are available only for student accounts');
  }
  if (code !== 'ECE') {
    if (academicStream) throw profileError('Academic streams are currently available only in Electrical and Computer Engineering');
    return;
  }
  if (role === 'INSTRUCTOR' && !academicStream) {
    throw profileError('Every Electrical and Computer Engineering instructor must have one academic stream');
  }
  if (role === 'STUDENT' && !yearLevel) {
    throw profileError('Every Electrical and Computer Engineering student must have a year level');
  }
  if (role === 'STUDENT' && yearLevel >= 4 && !academicStream) {
    throw profileError('Electrical and Computer Engineering students must select a stream starting from Year 4');
  }
  if (role === 'STUDENT' && yearLevel && yearLevel < 4 && academicStream) {
    throw profileError('Electrical and Computer Engineering stream selection starts from Year 4');
  }
  if (!['INSTRUCTOR', 'STUDENT'].includes(role) && academicStream) {
    throw profileError('Only Electrical and Computer Engineering instructors and Year 4-5 students can have an academic stream');
  }
}

export async function validateCourseAcademicProfile({ department, yearLevel, academicStream }) {
  const code = await departmentCode(department);
  if (code !== 'ECE' && academicStream) throw profileError('Academic streams are currently available only in Electrical and Computer Engineering');
  if (code === 'ECE' && yearLevel >= 4 && !academicStream) throw profileError('Year 4-5 Electrical and Computer Engineering courses must specify a stream');
  if (code === 'ECE' && yearLevel && yearLevel < 4 && academicStream) throw profileError('Electrical and Computer Engineering stream courses begin in Year 4');
}
