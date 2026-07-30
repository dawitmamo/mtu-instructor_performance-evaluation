export const roles = ['SUPER_ADMIN', 'HOD', 'INSTRUCTOR', 'STUDENT'];

export const demoUser = {
  name: 'Mira Admin',
  email: 'admin@mtu.edu.et',
  role: 'SUPER_ADMIN'
};

export const categories = [
  'Teaching Preparation',
  'Teaching Delivery',
  'Subject Knowledge',
  'Student Interaction',
  'Assessment',
  'Professionalism'
];

export const questions = {
  'Teaching Preparation': ['Course organization', 'Preparation', 'Lesson planning'],
  'Teaching Delivery': ['Communication', 'Clarity', 'Engagement', 'Confidence'],
  'Subject Knowledge': ['Expertise', 'Practical examples', 'Problem solving'],
  'Student Interaction': ['Respect', 'Availability', 'Fairness', 'Motivation'],
  Assessment: ['Timely feedback', 'Fair grading', 'Exam quality'],
  Professionalism: ['Punctuality', 'Ethics', 'Responsibility', 'Teamwork']
};

export const dashboard = {
  totals: { departments: 8, courses: 126, students: 9280, instructors: 412 },
  evaluationCompletion: 73,
  pendingEvaluations: 2411,
  averageScores: [
    { category: 'Teaching Preparation', score: 4.1 },
    { category: 'Teaching Delivery', score: 4.3 },
    { category: 'Subject Knowledge', score: 4.5 },
    { category: 'Student Interaction', score: 3.9 },
    { category: 'Assessment', score: 3.7 },
    { category: 'Professionalism', score: 4.4 }
  ]
};

export const instructor = {
  name: 'Dr. Ada Mensah',
  finalScore: 4.28,
  completionPercentage: 84,
  enrolledStudents: 148,
  peerCompleted: 5,
  hodStatus: 'Submitted',
  strengths: ['Subject Knowledge', 'Teaching Delivery', 'Professionalism'],
  weaknesses: ['Assessment turnaround'],
  recommendations: ['Add a rubric release checklist before each assessment window.'],
  comments: ['Clear explanations and practical examples.', 'Feedback could arrive earlier after midterms.'],
  trend: [
    { semester: '2024 S1', score: 3.8 },
    { semester: '2024 S2', score: 4.0 },
    { semester: '2025 S1', score: 4.1 },
    { semester: '2025 S2', score: 4.28 }
  ]
};

export const courses = [
  { code: 'CS401', title: 'Software Engineering', instructor: 'Dr. Ada Mensah', students: 62, status: 'Published' },
  { code: 'CS305', title: 'Database Systems', instructor: 'Dr. Kojo Annan', students: 74, status: 'Verified' },
  { code: 'CS210', title: 'Data Structures', instructor: 'Dr. Esi Boateng', students: 91, status: 'Draft' }
];
