import mongoose from 'mongoose';

const instructorAssignmentSchema = new mongoose.Schema(
  {
    instructor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    semester: { type: mongoose.Schema.Types.ObjectId, ref: 'Semester', required: true },
    enrolledStudents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    peerEvaluators: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: {
      type: String,
      enum: ['DRAFT', 'VERIFIED', 'PUBLISHED'],
      default: 'DRAFT'
    }
  },
  { timestamps: true }
);

instructorAssignmentSchema.index({ instructor: 1, course: 1, semester: 1 }, { unique: true });

export const InstructorAssignment = mongoose.model(
  'InstructorAssignment',
  instructorAssignmentSchema
);
