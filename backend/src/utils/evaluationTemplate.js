const ratingOptions = [
  { value: 1, label: 'VL', description: 'Very Low' },
  { value: 2, label: 'L', description: 'Low' },
  { value: 3, label: 'A', description: 'Average' },
  { value: 4, label: 'H', description: 'High' },
  { value: 5, label: 'VH', description: 'Very High' }
];

export const evaluationScale = {
  options: ratingOptions,
  allowNotApplicable: true,
  notApplicableLabel: 'NA'
};

export const evaluationTemplates = {
  STUDENT: {
    name: 'Student Instructor Performance Evaluation',
    description: 'To be completed by students for a course instructor.',
    categories: [
      {
        name: 'Core Competency',
        questions: [
          'The instructor is prepared and organized for class.',
          'The instructor explains course concepts clearly.',
          'The instructor demonstrates strong subject matter knowledge.',
          'The instructor relates lessons to practical examples.',
          'The instructor uses relevant teaching materials and resources.'
        ]
      },
      {
        name: 'Teaching Methodology',
        questions: [
          'The instructor encourages student participation.',
          'The instructor uses suitable teaching methods for the course.',
          'The instructor manages class time effectively.',
          'The instructor gives useful feedback on learning progress.',
          'The instructor handles questions respectfully and clearly.'
        ]
      },
      {
        name: 'Assessment and Feedback',
        questions: [
          'Assessments reflect the course objectives.',
          'Grading is fair and transparent.',
          'Feedback is provided within a reasonable time.',
          'The instructor communicates assessment expectations clearly.'
        ]
      },
      {
        name: 'Professional and Ethical Competency',
        questions: [
          'The instructor treats students with respect.',
          'The instructor is punctual and dependable.',
          'The instructor is available for academic support.',
          'The instructor follows university rules and professional conduct.'
        ]
      }
    ]
  },
  PEER: {
    name: 'Colleague Instructor Performance Evaluation',
    description: 'To be completed by colleagues for peer evaluation.',
    categories: [
      {
        name: 'Core Competency and Subject Matter Contribution',
        questions: [
          'Prepares teaching materials in the assigned teaching area.',
          'Delivers seminars or academic presentations relevant to the teaching area.',
          'Demonstrates strong subject matter knowledge and skill.'
        ]
      },
      {
        name: 'Research and Community Services',
        questions: [
          'Shows willingness to participate in community service and extension activities.',
          'Participates at department, faculty, college, or institution level.',
          'Conducts research in the teaching area and helps colleagues with publishing or development.'
        ]
      },
      {
        name: 'Professional Competency',
        questions: [
          'Gives guidance and counseling to students.',
          'Contributes constructive ideas and activities to teaching and learning.',
          'Participates in problem identification and solution at department, college, or institution level.',
          'Participates in continuing professional development such as CPD or HDP.',
          'Actively participates in cooperative learning, team teaching, and department activities.'
        ]
      },
      {
        name: 'Ethical Competency',
        questions: [
          'Participates responsibly in committees and assigned institutional duties.',
          'Shares resources and professional support with colleagues.',
          'Shows collegiality and respects the ideas of others.',
          'Maintains a positive attitude toward teaching duties.',
          'Respects institutional rules, regulations, and guidelines.',
          'Demonstrates discipline and commitment in department work.'
        ]
      }
    ]
  },
  HOD: {
    name: 'Immediate Supervisor Instructor Performance Evaluation',
    description: 'To be completed by the department head or immediate supervisor.',
    categories: [
      {
        name: 'Core Competency',
        questions: [
          'Pursues personal development in the area of specialization.',
          'Acquires and applies relevant subject matter knowledge.',
          'Demonstrates professional teaching skill and methodology.',
          'Accepts additional teaching tasks and institutional assignments when needed.',
          'Supports cooperative learning, internships, practical work, and related academic activities.',
          'Actively participates in teaching and learning activities, including review of materials or curriculum.',
          'Participates in committee affairs, community service, and extension activities.',
          'Carries out regular teaching duties responsibly.',
          'Participates in research, project work, and personal development.',
          'Serves effectively as an academic adviser.'
        ]
      },
      {
        name: 'Professional Competency',
        questions: [
          'Participates in problem identification and solution at department, college, or institution level.',
          'Participates in professional development such as CPD, HDP, ELIP, or related training.',
          'Submits required plans, reports, grades, and academic documents on time.',
          'Works cooperatively with department staff and academic committees.',
          'Uses feedback from supervision to improve teaching performance.'
        ]
      },
      {
        name: 'Ethical Competency',
        questions: [
          'Respects university rules, regulations, and guidelines.',
          'Demonstrates punctuality, discipline, and dependability.',
          'Treats students and colleagues fairly and respectfully.',
          'Uses university resources responsibly.',
          'Maintains professional integrity in academic duties.'
        ]
      }
    ]
  }
};

export const defaultEvaluationCategories = evaluationTemplates.STUDENT.categories;

export function templateCategoriesFor(kind = 'STUDENT') {
  return evaluationTemplates[kind]?.categories || defaultEvaluationCategories;
}
