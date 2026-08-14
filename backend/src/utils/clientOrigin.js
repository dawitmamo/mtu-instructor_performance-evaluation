import { networkInterfaces } from 'node:os';
import { env } from '../config/env.js';

function parsedUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url : undefined;
  } catch {
    return undefined;
  }
}

function isLoopback(hostname) {
  return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname);
}

function localInterfaceHosts() {
  return Object.values(networkInterfaces())
    .flat()
    .filter(Boolean)
    .flatMap(({ address }) => address.includes(':') ? [address, `[${address}]`] : [address]);
}

export function requestClientOrigin(req, { localHosts = localInterfaceHosts() } = {}) {
  const configured = parsedUrl(env.clientOrigin);
  const fallback = configured?.origin || 'http://localhost:5173';
  if (env.nodeEnv === 'production') return fallback;

  const candidate = parsedUrl(req.get('origin') || req.get('referer'));
  if (!candidate) return fallback;
  if (isLoopback(candidate.hostname) && configured && !isLoopback(configured.hostname)) return fallback;

  const allowedHosts = new Set([configured?.hostname, ...localHosts].filter(Boolean));
  return allowedHosts.has(candidate.hostname) ? candidate.origin : fallback;
}
