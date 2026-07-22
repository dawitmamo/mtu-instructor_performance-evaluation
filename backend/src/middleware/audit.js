import { AuditLog } from '../models/AuditLog.js';

export const audit = (action) => async (req, res, next) => {
  res.on('finish', async () => {
    if (res.statusCode >= 200 && res.statusCode < 400) {
      await AuditLog.create({
        action,
        actor: req.user?._id,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        metadata: { path: req.originalUrl, method: req.method }
      }).catch(() => {});
    }
  });
  next();
};
