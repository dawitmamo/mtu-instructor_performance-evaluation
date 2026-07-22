import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, department: user.department?.toString() },
    env.jwtAccessSecret,
    { expiresIn: env.accessTokenTtl }
  );
}

export function signRefreshToken(user) {
  return jwt.sign({ sub: user.id, tokenVersion: user.tokenVersion }, env.jwtRefreshSecret, {
    expiresIn: env.refreshTokenTtl
  });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.jwtAccessSecret);
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, env.jwtRefreshSecret);
}
