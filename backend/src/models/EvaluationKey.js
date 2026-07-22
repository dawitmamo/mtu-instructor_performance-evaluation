import mongoose from 'mongoose';

const evaluationKeySchema = new mongoose.Schema(
  {
    keyHash: { type: String, required: true, unique: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    assignment: { type: mongoose.Schema.Types.ObjectId, ref: 'InstructorAssignment', required: true },
    expiresAt: { type: Date, required: true },
    usedAt: Date,
    generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

evaluationKeySchema.index({ student: 1, assignment: 1 }, { unique: true });

export const EvaluationKey = mongoose.model('EvaluationKey', evaluationKeySchema);
