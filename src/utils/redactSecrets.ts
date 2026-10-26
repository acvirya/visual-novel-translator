const sensitiveField = /^(?:authorization|proxy-authorization|api[-_]?key|x-api-key|x-goog-api-key|token|access[-_]?token|refresh[-_]?token|password|secret)$/i;

export function redactSecretText(text: string): string {
  return text
    .replace(/\b(Bearer\s+)[^\s,"'}]+/gi, "$1[REDACTED]")
    .replace(/([?&](?:key|api_key|apiKey|access_token)=)[^&#\s]+/gi, "$1[REDACTED]")
    .replace(/\bsk-[a-zA-Z0-9_-]{8,}\b/g, "[REDACTED]")
    .replace(/((?:api[_-]?key|x-api-key|x-goog-api-key|password|access_token)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]");
}

/** Safe to serialize: handles errors, cycles and secret-bearing metadata. */
export function redactSecrets(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") return redactSecretText(value);
  if (typeof value === "bigint") return value.toString();
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (value instanceof Error) return { name: value.name, message: redactSecretText(value.message), stack: value.stack && redactSecretText(value.stack) };
  if (Array.isArray(value)) return value.map((entry) => redactSecrets(entry, seen));
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, sensitiveField.test(key) ? "[REDACTED]" : redactSecrets(entry, seen)]));
}
