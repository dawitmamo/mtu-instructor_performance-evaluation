import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const configDir = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(configDir, '../..');
const workspaceRoot = path.resolve(backendRoot, '..');

dotenv.config({ path: path.join(workspaceRoot, '.env') });
dotenv.config({ path: path.join(backendRoot, '.env'), override: true });

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: process.env.PORT || 5000,
  mongoUri: process.env.MONGO_URI || '',
  mongoMemoryFallback: process.env.MONGO_MEMORY_FALLBACK !== 'false',
  mongoDataPath: process.env.MONGO_DATA_PATH || '.data/mongodb',
  seedDemoData: process.env.SEED_DEMO_DATA !== 'false',
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET || 'dev-access-secret-change-me',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-me',
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL || '15m',
  refreshTokenTtl: process.env.REFRESH_TOKEN_TTL || '7d',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  googleOAuthClientId: process.env.GOOGLE_OAUTH_CLIENT_ID || '',
  googleOAuthClientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || '',
  googleOAuthCallbackUrl: process.env.GOOGLE_OAUTH_CALLBACK_URL || 'http://localhost:5000/api/auth/google/callback',
  googleOAuthAllowedDomain: process.env.GOOGLE_OAUTH_ALLOWED_DOMAIN || 'mtu.edu.et'
};

export function validateRuntimeConfig(config = env) {
  if (config.nodeEnv !== 'production') return;

  const weakSecrets = [
    ['JWT_ACCESS_SECRET', config.jwtAccessSecret],
    ['JWT_REFRESH_SECRET', config.jwtRefreshSecret]
  ].filter(([, value]) => !value || value.length < 32 || /change-me|change-this|before-production|replace-with|development|^dev-/i.test(value));

  if (weakSecrets.length) {
    throw new Error(`${weakSecrets.map(([name]) => name).join(' and ')} must use unique random values of at least 32 characters in production`);
  }
  if (config.jwtAccessSecret === config.jwtRefreshSecret) {
    throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different in production');
  }
}
