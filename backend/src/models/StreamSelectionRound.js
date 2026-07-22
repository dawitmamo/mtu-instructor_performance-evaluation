import mongoose from 'mongoose';
import { ACADEMIC_STREAMS } from '../constants/academicStreams.js';

const capacitySchema = new mongoose.Schema(
  {
    academicStream: { type: String, enum: ACADEMIC_STREAMS, required: true },
    seats: { type: Number, min: 0, required: true }
  },
  { _id: false }
);

const streamSelectionRoundSchema = new mongoose.Schema(
  {
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true, index: true },
    semester: { type: mongoose.Schema.Types.ObjectId, ref: 'Semester', required: true },
    eligibleYearLevel: { type: Number, enum: [3], default: 3 },
    status: { type: String, enum: ['DRAFT', 'OPEN', 'CLOSED', 'ALLOCATED'], default: 'DRAFT' },
    capacities: {
      type: [capacitySchema],
      validate: {
        validator: (items) => items.length === ACADEMIC_STREAMS.length && new Set(items.map((item) => item.academicStream)).size === ACADEMIC_STREAMS.length,
        message: 'Capacity is required once for each of the four streams'
      }
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    allocatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    allocatedAt: Date
  },
  { timestamps: true }
);

streamSelectionRoundSchema.index({ department: 1, semester: 1 }, { unique: true });

export const StreamSelectionRound = mongoose.model('StreamSelectionRound', streamSelectionRoundSchema);
