import mongoose from 'mongoose';
import { ACADEMIC_STREAMS } from '../constants/academicStreams.js';

const streamPreferenceSchema = new mongoose.Schema(
  {
    round: { type: mongoose.Schema.Types.ObjectId, ref: 'StreamSelectionRound', required: true, index: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    choices: {
      type: [{ type: String, enum: ACADEMIC_STREAMS }],
      validate: {
        validator: (items) => items.length === 3 && new Set(items).size === 3,
        message: 'Select exactly three different streams'
      }
    },
    gpaSnapshot: { type: Number, min: 0, max: 4 },
    allocatedStream: { type: String, enum: ACADEMIC_STREAMS },
    allocationRank: { type: Number, min: 1, max: 4 },
    status: { type: String, enum: ['SUBMITTED', 'ALLOCATED'], default: 'SUBMITTED' },
    submittedAt: { type: Date, default: Date.now },
    allocatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

streamPreferenceSchema.index({ round: 1, student: 1 }, { unique: true });

export const StreamPreference = mongoose.model('StreamPreference', streamPreferenceSchema);
