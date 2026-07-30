import { User } from '../models/User.js';
import { verifyAccessToken } from '../utils/tokens.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { syncUserCommitteeMembership } from '../services/committeeMembership.js';

export const authenticate = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) return res.status(401).json({ message: 'Authentication required' });

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    return res.status(401).json({ message: 'Invalid or expired session' });
  }
  const user = await User.findById(payload.sub).select('-passwordHash');
  if (!user || !user.isActive) return res.status(401).json({ message: 'Invalid session' });
  await syncUserCommitteeMembership(user);

  req.user = user;
  return next();
});

export const authorize = (...roles) => (req, res, next) => {
  const delegatedRoles = req.user.committeeRoles || [];
  if (!roles.includes(req.user.role) && !roles.some((role) => delegatedRoles.includes(role))) {
    return res.status(403).json({ message: 'Insufficient permissions' });
  }
  return next();
};
