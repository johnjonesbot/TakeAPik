const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;

export type LogLevel = keyof typeof LEVELS;

const SENSITIVE_KEY_PATTERN =
  /(password|passwd|secret|token|code|authorization|cookie|session|signature|signedurl|email|url)/i;

/**
 * Replace values whose key names look secret- or PII-bearing, recursively.
 * Redaction is by key, not value, so new call sites stay safe by default.
 */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[depth-limited]";
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      result[key] = SENSITIVE_KEY_PATTERN.test(key) ? "[redacted]" : redact(entry, depth + 1);
    }
    return result;
  }
  return value;
}

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

function write(level: LogLevel, minimum: LogLevel, bindings: Record<string, unknown>, message: string, context?: Record<string, unknown>): void {
  if (LEVELS[level] < LEVELS[minimum]) return;
  const line = JSON.stringify({
    level,
    time: new Date().toISOString(),
    message,
    ...(redact(bindings) as Record<string, unknown>),
    ...(context ? (redact(context) as Record<string, unknown>) : {})
  });
  if (level === "error") process.stderr.write(`${line}\n`);
  else process.stdout.write(`${line}\n`);
}

export function createLogger(minimum: LogLevel = "info", bindings: Record<string, unknown> = {}): Logger {
  return {
    debug: (message, context) => write("debug", minimum, bindings, message, context),
    info: (message, context) => write("info", minimum, bindings, message, context),
    warn: (message, context) => write("warn", minimum, bindings, message, context),
    error: (message, context) => write("error", minimum, bindings, message, context),
    child: (childBindings) => createLogger(minimum, { ...bindings, ...childBindings })
  };
}

let rootLogger: Logger | undefined;

export function getLogger(): Logger {
  if (!rootLogger) {
    const level = (process.env.LOG_LEVEL as LogLevel | undefined) ?? "info";
    rootLogger = createLogger(level in LEVELS ? level : "info", { service: "takeapik" });
  }
  return rootLogger;
}
