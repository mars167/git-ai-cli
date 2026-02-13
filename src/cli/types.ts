import { z, ZodSchema } from 'zod';
import { createLogger } from '../core/log';

/**
 * Standard CLI result interface for successful operations
 * 
 * Agent-readable output format:
 * - ok: boolean indicating success/failure
 * - command: the command that was executed
 * - repoRoot: repository root path (when applicable)
 * - timestamp: ISO 8601 timestamp
 * - duration_ms: execution time in milliseconds
 * - data: command-specific result data
 */
export interface CLIResult {
  ok: true;
  command?: string;
  repoRoot?: string;
  timestamp?: string;
  duration_ms?: number;
  [key: string]: unknown;
}

/**
 * Standard CLI error interface
 * 
 * Agent-readable error format:
 * - ok: always false
 * - reason: machine-readable error code
 * - message: human-readable error description
 * - command: the command that failed
 * - timestamp: ISO 8601 timestamp
 * - hint: optional suggestion for resolution
 */
export interface CLIError {
  ok: false;
  reason: string;
  message?: string;
  command?: string;
  timestamp?: string;
  hint?: string;
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
  const startedAt = Date.now();
  const timestamp = new Date().toISOString();
  
  const handler = cliHandlers[commandKey];
  if (!handler) {
    console.error(JSON.stringify(
      { 
        ok: false, 
        reason: 'unknown_command', 
        command: commandKey,
        timestamp,
        hint: 'Run "git-ai --help" to see available commands'
      },
      null,
      2
    ));
    process.exit(1);
    return;
  }

  const log = createLogger({ component: 'cli', cmd: commandKey });

  try {
    const validInput = handler.schema.parse(rawInput);
    const result = await handler.handler(validInput);
    const duration_ms = Date.now() - startedAt;

    if (result.ok) {
      const agentResult = {
        ...result,
        command: commandKey,
        timestamp,
        duration_ms,
      };
      console.log(JSON.stringify(agentResult, null, 2));
      process.exit(0);
    } else {
      const agentError = {
        ...result,
        command: commandKey,
        timestamp,
        duration_ms,
      };
      process.stderr.write(JSON.stringify(agentError, null, 2) + '\n');
      process.exit(2);
    }
  } catch (e) {
    const duration_ms = Date.now() - startedAt;
    
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
          command: commandKey,
          timestamp,
          duration_ms,
          errors,
          hint: 'Check command syntax with --help'
        },
        null,
        2
      ));
      process.exit(1);
      return;
    }

    const errorDetails = e instanceof Error
      ? { name: e.name, message: e.message, stack: e.stack }
      : { message: String(e) };

    log.error(commandKey, { ok: false, err: errorDetails });
    
    console.error(JSON.stringify(
      {
        ok: false,
        reason: 'internal_error',
        message: e instanceof Error ? e.message : String(e),
        command: commandKey,
        timestamp,
        duration_ms,
        hint: 'An unexpected error occurred. Check logs for details.'
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
 * Create a success result with agent-readable metadata
 */
export function success(data: Record<string, unknown>): CLIResult {
  return { 
    ok: true, 
    ...data,
  };
}

/**
 * Create an error result with agent-readable metadata
 */
export function error(reason: string, details?: Record<string, unknown>): CLIError {
  return { 
    ok: false, 
    reason, 
    ...details,
  };
}

/**
 * Common error reasons for consistent agent handling
 */
export const ErrorReasons = {
  INDEX_NOT_FOUND: 'index_not_found',
  INDEX_INCOMPATIBLE: 'index_incompatible',
  REPO_NOT_FOUND: 'repo_not_found',
  NOT_A_GIT_REPO: 'not_a_git_repo',
  VALIDATION_ERROR: 'validation_error',
  INTERNAL_ERROR: 'internal_error',
  QUERY_FAILED: 'query_failed',
  SEMANTIC_SEARCH_FAILED: 'semantic_search_failed',
  GRAPH_QUERY_FAILED: 'graph_query_failed',
  PACK_FAILED: 'pack_failed',
  UNPACK_FAILED: 'unpack_failed',
  HOOKS_INSTALL_FAILED: 'hooks_install_failed',
  AGENT_INSTALL_FAILED: 'agent_install_failed',
  LANG_NOT_AVAILABLE: 'lang_not_available',
} as const;

/**
 * Common hints for error resolution
 */
export const ErrorHints = {
  INDEX_NOT_FOUND: 'Run "git-ai ai index --overwrite" to create an index',
  INDEX_INCOMPATIBLE: 'Run "git-ai ai index --overwrite" to rebuild the index',
  REPO_NOT_FOUND: 'Ensure you are in a git repository or specify --path',
  NOT_A_GIT_REPO: 'Initialize a git repository with "git init"',
  VALIDATION_ERROR: 'Check command syntax with --help',
  LANG_NOT_AVAILABLE: 'Check available languages with "git-ai ai status"',
} as const;
