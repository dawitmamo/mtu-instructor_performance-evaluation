import { Router } from 'express';
import { allocateStreams, getStreamSelectionManagement, getStudentStreamSelection, saveStreamSelectionRound, submitStreamPreferences } from '../controllers/streamSelectionController.js';
import { audit } from '../middleware/audit.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { streamPreferenceSchema, streamSelectionRoundSchema } from '../validators/schemas.js';

export const streamSelectionRoutes = Router();
streamSelectionRoutes.use(authenticate);
streamSelectionRoutes.get('/stream-selection/student', authorize('STUDENT'), getStudentStreamSelection);
streamSelectionRoutes.post('/stream-selection/preferences', authorize('STUDENT'), validate(streamPreferenceSchema), audit('STREAM_PREFERENCES_SUBMITTED'), submitStreamPreferences);
streamSelectionRoutes.get('/stream-selection/manage', authorize('HOD', 'COURSE_EXAM_COMMITTEE'), getStreamSelectionManagement);
streamSelectionRoutes.post('/stream-selection/rounds', authorize('HOD', 'COURSE_EXAM_COMMITTEE'), validate(streamSelectionRoundSchema), audit('STREAM_SELECTION_ROUND_SAVED'), saveStreamSelectionRound);
streamSelectionRoutes.post('/stream-selection/rounds/:id/allocate', authorize('HOD', 'COURSE_EXAM_COMMITTEE'), audit('STREAMS_ALLOCATED'), allocateStreams);
