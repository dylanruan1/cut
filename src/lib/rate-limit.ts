const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(
  key: string,
  limit = 60,
  windowMs = 60_000
): { success: boolean; remaining: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return { success: true, remaining: limit - 1 };
  }

  if (entry.count >= limit) {
    return { success: false, remaining: 0 };
  }

  entry.count++;
  return { success: true, remaining: limit - entry.count };
}

export function sanitizeInput(input: string): string {
  return input
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, 1000);
}
