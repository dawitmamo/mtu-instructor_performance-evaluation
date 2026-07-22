import mongoose from 'mongoose';
import { evaluationScale, templateCategoriesFor } from '../utils/evaluationTemplate.js';

const questionSchema = new mongoose.Schema(
  {
    text: { type: String, required: true },
    order: { type: Number, required: true }
  },
  { _id: false }
);

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    questions: [questionSchema]
  },
  { _id: false }
);

const scaleOptionSchema = new mongoose.Schema(
  {
    value: { type: Number, required: true, min: 1, max: 5 },
    label: { type: String, required: true },
    description: { type: String, required: true }
  },
  { _id: false }
);

const evaluationTemplateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    kind: { type: String, enum: ['STUDENT', 'PEER', 'HOD'], default: 'STUDENT', index: true },
    description: { type: String, default: '' },
    version: { type: Number, default: 1 },
    isActive: { type: Boolean, default: true },
    scale: {
      options: { type: [scaleOptionSchema], default: () => evaluationScale.options },
      allowNotApplicable: { type: Boolean, default: evaluationScale.allowNotApplicable },
      notApplicableLabel: { type: String, default: evaluationScale.notApplicableLabel }
    },
    categories: {
      type: [categorySchema],
      default: function defaultCategories() {
        return templateCategoriesFor(this?.kind || 'STUDENT').map((category) => ({
          name: category.name,
          questions: category.questions.map((text, index) => ({ text, order: index + 1 }))
        }));
      }
    }
  },
  { timestamps: true }
);

evaluationTemplateSchema.index({ kind: 1, version: 1 }, { unique: true });

export const EvaluationTemplate = mongoose.model('EvaluationTemplate', evaluationTemplateSchema);
