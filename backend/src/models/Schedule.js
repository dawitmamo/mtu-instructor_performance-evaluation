import mongoose from 'mongoose';

const scheduleSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, maxlength: 5000 },
    scheduleType: { type: String, enum: ['CLASS', 'EXAM', 'COMBINED'], required: true, index: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true, index: true },
    semester: { type: mongoose.Schema.Types.ObjectId, ref: 'Semester', required: true, index: true },
    status: { type: String, enum: ['DRAFT', 'PUBLISHED'], default: 'PUBLISHED', index: true },
    fileName: { type: String, trim: true },
    fileContentType: { type: String, enum: ['application/pdf', 'text/csv'] },
    fileData: { type: Buffer, select: false },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    publishedAt: Date
  },
  { timestamps: true }
);

scheduleSchema.index({ department: 1, semester: 1, status: 1, createdAt: -1 });

export const Schedule = mongoose.model('Schedule', scheduleSchema);
