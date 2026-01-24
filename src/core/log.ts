export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const levelOrder: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function getConfiguredLevel(): LogLevel | null {
  const raw = String(process.env.GIT_AI_LOG_LEVEL ?? process.env.LOG_LEVEL ?? '').trim().toLowerCase();
  if (!raw) return 'info';
  if (raw === 'silent' || raw === 'off' || raw === 'none' || raw === '0') return null;
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') return raw;
  return 'info';
}

function serializeError(e: unknown): { name?: string; message?: string; stack?: string } | undefined {
  if (!e) return undefined;
  if (e instanceof Error) return { name: e.name, message: e.message, stack: e.stack };
  return { message: String(e) };
}

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  child(fields: Record<string, unknown>): Logger;
  span<T>(name: string, fields: Record<string, unknown>, fn: () => Promise<T>): Promise<T>;
}

export function createLogger(baseFields: Record<string, unknown> = {}): Logger {
  const configured = getConfiguredLevel();
  const threshold = configured ? levelOrder[configured] : Infinity;

  const write = (level: LogLevel, msg: string, fields?: Record<string, unknown>) => {
    if (levelOrder[level] < threshold) return;
    const rec = {
      ts: new Date().toISOString(),
      level,
      msg,
      ...baseFields,
      ...(fields ?? {}),
    };
    process.stderr.write(JSON.stringify(rec) + '\n');
  };

  const logger: Logger = {
    debug: (msg, fields) => write('debug', msg, fields),
    info: (msg, fields) => write('info', msg, fields),
    warn: (msg, fields) => write('warn', msg, fields),
    error: (msg, fields) => write('error', msg, fields),
    child: (fields) => createLogger({ ...baseFields, ...fields }),
    span: async (name, fields, fn) => {
      const startedAt = Date.now();
      try {
        const out = await fn();
        write('info', name, { ...fields, ok: true, duration_ms: Date.now() - startedAt });
        return out;
      } catch (e) {
        write('error', name, { ...fields, ok: false, duration_ms: Date.now() - startedAt, err: serializeError(e) });
        throw e;
      }
    },
  };

  return logger;
}

