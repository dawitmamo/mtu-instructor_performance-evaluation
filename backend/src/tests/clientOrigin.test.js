import { env } from '../config/env.js';
import { requestClientOrigin } from '../utils/clientOrigin.js';

function request(headers) {
  return { get: (name) => headers[name.toLowerCase()] };
}

test('development email links follow the frontend host used for the request', () => {
  const previousNodeEnv = env.nodeEnv;
  env.nodeEnv = 'development';
  try {
    expect(requestClientOrigin(request({
      origin: 'http://192.168.1.9:5173',
      host: '192.168.1.9:5173'
    }), { localHosts: ['192.168.1.9'] })).toBe('http://192.168.1.9:5173');
  } finally {
    env.nodeEnv = previousNodeEnv;
  }
});

test('email links reject an origin from a different host', () => {
  const previousNodeEnv = env.nodeEnv;
  env.nodeEnv = 'development';
  try {
    expect(requestClientOrigin(request({
      origin: 'https://untrusted.example',
      host: '192.168.1.9:5173'
    }))).toBe(new URL(env.clientOrigin).origin);
  } finally {
    env.nodeEnv = previousNodeEnv;
  }
});

test('a forged Host header cannot authorize an emailed link origin', () => {
  const previousNodeEnv = env.nodeEnv;
  env.nodeEnv = 'development';
  try {
    expect(requestClientOrigin(request({
      origin: 'https://untrusted.example',
      host: 'untrusted.example'
    }), { localHosts: ['192.168.1.9'] })).toBe(new URL(env.clientOrigin).origin);
  } finally {
    env.nodeEnv = previousNodeEnv;
  }
});

test('a local admin session keeps the configured LAN address for recipient links', () => {
  const previousNodeEnv = env.nodeEnv;
  env.nodeEnv = 'development';
  try {
    expect(requestClientOrigin(request({
      origin: 'http://localhost:5173',
      host: 'localhost:5173'
    }))).toBe(new URL(env.clientOrigin).origin);
  } finally {
    env.nodeEnv = previousNodeEnv;
  }
});
