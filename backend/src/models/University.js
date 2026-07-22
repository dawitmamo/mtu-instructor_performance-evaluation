import mongoose from 'mongoose';

const universitySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    campuses: [{ name: String, city: String, country: String }],
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

export const University = mongoose.model('University', universitySchema);
