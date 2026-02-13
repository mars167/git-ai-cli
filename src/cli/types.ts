import { z, ZodSchema } from 'zod';
import { createLogger } from '../core/log';

/**
 * Standard CLI result interface for successful operations
 */
export interface CLIResult {
  ok: true;
  [key: string]: unknown;
}

/**
 * Standard CLI error interface
 */
export interface CLIError {
  ok: false;
  reason: string;
  message?: string;
  [key: string]: unknown;
}

/**
 * CLI handler function signature
 * @template TInput - Validated input type (from Zod schema)
 */
export type CLIHandler<TInput = unknown> = (input: TInput) => Promise<CLIResult | CLIError>;

/**
 * Handler registration with schema and handler function
 */
export interface HandlerRegistration<TInput = unknown> {
  schema: ZodSchema<TInput>;
  handler: CLIHandler<TInput>;
}

/**
 * Execute a CLI handler with validation and error handling
 * 
 * @param commandKey - Unique command identifier (e.g., 'graph:find', 'semantic')
 * @param rawInput - Raw input from Commander.js (arguments + options)
 * 
 * @example
 * ```typescript
 * .action(async (prefix, options) => {
 *   await executeHandler('graph:find', { prefix, ...options });
 * })
 * ```
 */
export async function executeHandler(
  commandKey: string,
  rawInput: unknown
): Promise<void> {
  const { cliHandlers } = await import('./registry.js');
  
  const handler = cliHandlers[commandKey];
  if (!handler) {
    console.error(JSON.stringify(
      { ok: false, reason: 'unknown_command', command: commandKey },
      null,
      2
    ));
    process.exit(1);
    return;
  }

  const log = createLogger({ component: 'cli', cmd: commandKey });

  try {
    // Validate input with Zod schema
    const validInput = handler.schema.parse(rawInput);
    
    // Execute handler
    const result = await handler.handler(validInput);

    if (result.ok) {
      // Success: output to stdout
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    } else {
      // Business logic error: output to stderr, exit with code 2
      process.stderr.write(JSON.stringify(result, null, 2) + '\n');
      process.exit(2);
    }
  } catch (e) {
    if (e instanceof z.ZodError) {
      const errors = e.issues.map((err: z.ZodIssue) => ({
        path: err.path.join('.'),
        message: err.message,
        code: err.code,
      }));
      
      console.error(JSON.stringify(
        {
          ok: false,
          reason: 'validation_error',
          message: 'Invalid command arguments',
          errors,
        },
        null,
        2
      ));
      process.exit(1);
      return;
    }

    // Unexpected error
    const errorDetails = e instanceof Error
      ? { name: e.name, message: e.message, stack: e.stack }
      : { message: String(e) };

    log.error(commandKey, { ok: false, err: errorDetails });
    
    console.error(JSON.stringify(
      {
        ok: false,
        reason: 'internal_error',
        message: e instanceof Error ? e.message : String(e),
      },
      null,
      2
    ));
    process.exit(1);
  }
}

/**
 * Format a result for CLI output (utility for handlers that want custom formatting)
 */
export function formatCLIResult(result: CLIResult | CLIError): string {
  return JSON.stringify(result, null, 2);
}

/**
 * Create a success result
 */
export function success(data: Record<string, unknown>): CLIResult {
  return { ok: true, ...data };
}

/**
 * Create an error result
 */
export function error(reason: string, details?: Record<string, unknown>): CLIError {
  return { ok: false, reason, ...details };
}
