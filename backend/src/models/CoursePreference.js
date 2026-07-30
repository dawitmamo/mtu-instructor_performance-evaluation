import mongoose from 'mongoose';

const coursePreferenceSchema = new mongoose.Schema(
  {
    instructor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
    semester: { type: mongoose.Schema.Types.ObjectId, ref: 'Semester', required: true },
    choices: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Course' }],
      validate: {
        validator(choices) {
          return choices.length >= 1 && choices.length <= 3 && new Set(choices.map(String)).size === choices.length;
        },
        message: 'Select between one and three different courses'
      },
      required: true
    },
    status: { type: String, enum: ['SUBMITTED', 'RECOMMENDED', 'FINALIZED', 'CONFIRMED'], default: 'SUBMITTED', index: true },
    submittedAt: { type: Date, default: Date.now },
    recommendedCourse: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
    recommendedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    recommendedAt: Date,
    committeeNote: { type: String, trim: true, maxlength: 1000 },
    confirmedCourse: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
    confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    confirmedAt: Date,
    hodNote: { type: String, trim: true, maxlength: 1000 }
  },
  { timestamps: true }
);

coursePreferenceSchema.index({ instructor: 1, semester: 1 }, { unique: true });
coursePreferenceSchema.index(
  { semester: 1, confirmedCourse: 1 },
  { unique: true, partialFilterExpression: { confirmedCourse: { $type: 'objectId' } } }
);

export const CoursePreference = mongoose.model('CoursePreference', coursePreferenceSchema);
