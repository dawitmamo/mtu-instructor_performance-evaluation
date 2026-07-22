import mongoose from 'mongoose';

const studentSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    studentNumber: { type: String, required: true, unique: true, trim: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
    registeredCourses: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Course' }],
    status: { type: String, enum: ['ACTIVE', 'GRADUATED', 'SUSPENDED'], default: 'ACTIVE' }
  },
  { timestamps: true }
);

export const Student = mongoose.model('Student', studentSchema);
