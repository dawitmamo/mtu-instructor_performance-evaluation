import mongoose from 'mongoose';

const reportSchema = new mongoose.Schema(
  {
    instructor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    semester: { type: mongoose.Schema.Types.ObjectId, ref: 'Semester', required: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
    overallScore: Number,
    categoryScores: [{ category: String, score: Number }],
    strengths: [String],
    weaknesses: [String],
    recommendations: [String],
    comments: [String],
    sourceScores: {
      student: { type: Number, default: 0 },
      peer: { type: Number, default: 0 },
      hod: { type: Number, default: 0 }
    },
    weightedContributions: {
      student: { type: Number, default: 0 },
      peer: { type: Number, default: 0 },
      hod: { type: Number, default: 0 }
    },
    courseResults: [{
      course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
      assignment: { type: mongoose.Schema.Types.ObjectId, ref: 'InstructorAssignment' },
      courseCode: String,
      courseTitle: String,
      studentScore: { type: Number, default: 0 },
      peerScore: { type: Number, default: 0 },
      hodScore: { type: Number, default: 0 },
      studentWeighted: { type: Number, default: 0 },
      peerWeighted: { type: Number, default: 0 },
      hodWeighted: { type: Number, default: 0 },
      finalScore: { type: Number, default: 0 }
    }],
    status: { type: String, enum: ['DRAFT', 'PUBLISHED'], default: 'DRAFT', index: true },
    finalSummary: { type: String, maxlength: 4000, default: '' },
    generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    publishedAt: Date
  },
  { timestamps: true }
);

reportSchema.index({ instructor: 1, semester: 1 }, { unique: true });

export const Report = mongoose.model('Report', reportSchema);
