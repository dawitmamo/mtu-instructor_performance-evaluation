import mongoose from 'mongoose';
import { ACADEMIC_STREAMS } from '../constants/academicStreams.js';

const courseSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, uppercase: true, trim: true },
    title: { type: String, required: true, trim: true },
    creditHours: { type: Number, default: 3, min: 1, max: 8 },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
    semester: { type: mongoose.Schema.Types.ObjectId, ref: 'Semester', required: true },
    level: { type: String, trim: true },
    yearLevel: { type: Number, min: 2, max: 5 },
    academicStream: { type: String, enum: ACADEMIC_STREAMS }
  },
  { timestamps: true }
);

courseSchema.index({ code: 1, semester: 1 }, { unique: true });
courseSchema.index({ department: 1, semester: 1 });

export const Course = mongoose.model('Course', courseSchema);
