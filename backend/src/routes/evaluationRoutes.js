import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { audit } from '../middleware/audit.js';
import { validate } from '../middleware/validate.js';
import { hodEvaluationSchema, peerEvaluationSchema, studentEvaluationSchema } from '../validators/schemas.js';
import { getEvaluationTemplate, listEvaluationTargets, studentEvaluationStatus, submitHodEvaluation, submitPeerEvaluation, submitStudentEvaluation } from '../controllers/evaluationController.js';

export const evaluationRoutes = Router();
evaluationRoutes.use(authenticate);
evaluationRoutes.get('/evaluation-templates/:kind', getEvaluationTemplate);
evaluationRoutes.get('/evaluations/targets/:kind', authorize('INSTRUCTOR', 'HOD'), listEvaluationTargets);
evaluationRoutes.post('/evaluations/student', authorize('STUDENT'), validate(studentEvaluationSchema), audit('STUDENT_EVALUATION_SUBMITTED'), submitStudentEvaluation);
evaluationRoutes.post('/evaluations/peer', authorize('INSTRUCTOR'), validate(peerEvaluationSchema), audit('PEER_EVALUATION_SUBMITTED'), submitPeerEvaluation);
evaluationRoutes.post('/evaluations/hod', authorize('HOD'), validate(hodEvaluationSchema), audit('HOD_EVALUATION_SUBMITTED'), submitHodEvaluation);
evaluationRoutes.get('/evaluations/student/status', authorize('STUDENT'), studentEvaluationStatus);
