import mongoose from 'mongoose';

const responseSchema = new mongoose.Schema(
  {
    category: { type: String, required: true },
    question: { type: String, required: true },
    score: { type: Number, min: 1, max: 5 },
    notApplicable: { type: Boolean, default: false }
  },
  { _id: false }
);

responseSchema.pre('validate', function requireScoreOrNotApplicable(next) {
  if (!this.notApplicable && typeof this.score !== 'number') {
    this.invalidate('score', 'Score is required unless the response is marked not applicable.');
  }
  next();
});

const baseOptions = { discriminatorKey: 'kind', timestamps: true };

const evaluationSchema = new mongoose.Schema(
  {
    instructor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
    assignment: { type: mongoose.Schema.Types.ObjectId, ref: 'InstructorAssignment' },
    semester: { type: mongoose.Schema.Types.ObjectId, ref: 'Semester', required: true, index: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
    template: { type: mongoose.Schema.Types.ObjectId, ref: 'EvaluationTemplate' },
    responses: [responseSchema],
    anonymousComment: { type: String, maxlength: 2000 },
    submittedAt: { type: Date, default: Date.now }
  },
  baseOptions
);

export const Evaluation = mongoose.model('Evaluation', evaluationSchema);

export const StudentEvaluation = Evaluation.discriminator(
  'STUDENT',
  new mongoose.Schema({
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, select: false }
  })
);

StudentEvaluation.schema.index({ student: 1, assignment: 1 }, { unique: true });

export const PeerEvaluation = Evaluation.discriminator(
  'PEER',
  new mongoose.Schema({
    evaluator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, select: false }
  })
);

PeerEvaluation.schema.index({ evaluator: 1, assignment: 1 }, { unique: true, name: 'unique_peer_evaluator_assignment' });

export const HodEvaluation = Evaluation.discriminator(
  'HOD',
  new mongoose.Schema({
    evaluator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
  })
);

HodEvaluation.schema.index({ evaluator: 1, assignment: 1 }, { unique: true, name: 'unique_hod_evaluator_assignment' });
