import mongoose from 'mongoose';

const instructorAssignmentSchema = new mongoose.Schema(
  {
    instructor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    semester: { type: mongoose.Schema.Types.ObjectId, ref: 'Semester', required: true },
    enrollmentMode: { type: String, enum: ['COHORT', 'INDIVIDUAL'], default: 'INDIVIDUAL' },
    studentCohort: {
      type: {
        yearLevel: { type: Number, min: 2, max: 5, required: true },
        academicStream: { type: String }
      },
      _id: false
    },
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
instructorAssignmentSchema.index({ course: 1, status: 1, updatedAt: -1 });
instructorAssignmentSchema.index({ enrolledStudents: 1, status: 1 });
instructorAssignmentSchema.index({ peerEvaluators: 1, status: 1 });

export const InstructorAssignment = mongoose.model(
  'InstructorAssignment',
  instructorAssignmentSchema
);
