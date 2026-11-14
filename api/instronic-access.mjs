import { createHash, timingSafeEqual } from 'node:crypto';

const digest = (value) => createHash('sha256').update(value).digest();

export default function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).end();
  }

  const password = process.env.INSTRONIC_PASSWORD;
  const key = process.env.INSTRONIC_KEY;
  if (!password || !/^[0-9a-f]{64}$/i.test(key ?? '')) {
    return response.status(503).end();
  }

  const supplied = request.body?.password;
  if (typeof supplied !== 'string' || supplied.length > 128 ||
      !timingSafeEqual(digest(supplied), digest(password))) {
    return response.status(401).end();
  }

  return response.status(200).json({ key });
}
