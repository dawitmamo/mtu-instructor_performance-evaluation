import { validateRuntimeConfig } from '../config/env.js';

test('development accepts local fallback secrets', () => {
  expect(() => validateRuntimeConfig({ nodeEnv: 'development' })).not.toThrow();
});

test('production requires distinct strong JWT secrets', () => {
  const base = {
    nodeEnv: 'production',
    jwtAccessSecret: 'a'.repeat(32),
    jwtRefreshSecret: 'b'.repeat(32)
  };
  expect(() => validateRuntimeConfig({ ...base, jwtAccessSecret: 'change-me' })).toThrow(/JWT_ACCESS_SECRET/);
  expect(() => validateRuntimeConfig({ ...base, jwtAccessSecret: 'dev-access-secret-change-this-before-production' })).toThrow(/JWT_ACCESS_SECRET/);
  expect(() => validateRuntimeConfig({ ...base, jwtRefreshSecret: base.jwtAccessSecret })).toThrow(/must be different/);
  expect(() => validateRuntimeConfig(base)).not.toThrow();
});

test('production can start with SMTP notifications disabled or configured later', () => {
  expect(() => validateRuntimeConfig({
    nodeEnv: 'production',
    jwtAccessSecret: 'a'.repeat(32),
    jwtRefreshSecret: 'b'.repeat(32)
  })).not.toThrow();
});
