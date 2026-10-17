/**
 * Resolves the true client IP address, designed for Vercel serverless deployments
 * and standard reverse proxy environments.
 *
 * In Vercel deployments:
 * - 'x-vercel-forwarded-for' is explicitly appended/set by the Vercel Edge network.
 * - 'x-real-ip' represents the actual client connecting to the edge.
 * - 'x-forwarded-for' contains the chain of proxies.
 *
 * Priority order:
 * 1. x-vercel-forwarded-for (first IP in chain)
 * 2. x-real-ip
 * 3. x-forwarded-for (first IP in chain)
 * 4. req.ip (Express trust proxy resolution)
 * 5. req.socket.remoteAddress
 * 6. Fallback '127.0.0.1'
 *
 * @param {import('express').Request} req
 * @returns {string} Clean client IP address
 */
export function getClientIp(req) {
  if (!req || !req.headers) return '127.0.0.1';

  let resolvedIp = '';

  const vercelForwarded = req.headers['x-vercel-forwarded-for'];
  if (vercelForwarded && typeof vercelForwarded === 'string') {
    resolvedIp = vercelForwarded.split(',')[0].trim();
  } else {
    const realIp = req.headers['x-real-ip'];
    if (realIp && typeof realIp === 'string') {
      resolvedIp = realIp.trim();
    } else {
      const forwardedFor = req.headers['x-forwarded-for'];
      if (forwardedFor && typeof forwardedFor === 'string') {
        resolvedIp = forwardedFor.split(',')[0].trim();
      } else if (req.ip) {
        resolvedIp = req.ip;
      } else if (req.socket?.remoteAddress) {
        resolvedIp = req.socket.remoteAddress;
      } else {
        resolvedIp = '127.0.0.1';
      }
    }
  }

  // Normalize IPv6 mapped IPv4 (::ffff:127.0.0.1 -> 127.0.0.1)
  if (resolvedIp.startsWith('::ffff:')) {
    resolvedIp = resolvedIp.slice(7);
  }

  if (process.env.DEBUG_IP === 'true') {
    console.log('[DEBUG_IP]', {
      resolvedIp,
      'x-vercel-forwarded-for': req.headers['x-vercel-forwarded-for'],
      'x-real-ip': req.headers['x-real-ip'],
      'x-forwarded-for': req.headers['x-forwarded-for'],
      expressIp: req.ip,
    });
  }

  return resolvedIp || '127.0.0.1';
}
