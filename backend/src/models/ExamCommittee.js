import mongoose from 'mongoose';

const examCommitteeSchema = new mongoose.Schema(
  {
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
    semester: { type: mongoose.Schema.Types.ObjectId, ref: 'Semester', required: true },
    members: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      validate: {
        validator: (members) => members.length === 3 && new Set(members.map(String)).size === 3,
        message: 'A Course and Exam Committee must contain exactly three different instructors'
      }
    },
    chair: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    appointedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['ACTIVE', 'CLOSED'], default: 'ACTIVE' }
  },
  { timestamps: true }
);

examCommitteeSchema.index({ department: 1, semester: 1 }, { unique: true });

export const ExamCommittee = mongoose.model('ExamCommittee', examCommitteeSchema);
