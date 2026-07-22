import mongoose from 'mongoose';

const semesterSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    academicYear: { type: String, required: true },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    evaluationOpensAt: Date,
    evaluationClosesAt: Date,
    status: {
      type: String,
      enum: ['DRAFT', 'SCHEDULED', 'OPEN', 'CLOSED', 'ARCHIVED'],
      default: 'DRAFT'
    }
  },
  { timestamps: true }
);

export const Semester = mongoose.model('Semester', semesterSchema);
