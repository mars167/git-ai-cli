import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * Base context passed to all tool handlers
 */
export interface ToolContext {
  startDir: string;
  options: {
    disableAccessLog?: boolean;
  };
}

/**
 * Repository context resolved from path
 */
export interface RepoContext {
  repoRoot: string;
  scanRoot: string;
  dim: number;
  meta: any | null;
}

/**
 * Tool handler function signature
 */
export type ToolHandler<TArgs = any> = (
  args: TArgs,
  context: ToolContext
) => Promise<CallToolResult>;

/**
 * Tool definition with metadata
 */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
  handler: ToolHandler;
}

/**
 * Standard success response
 */
export interface SuccessResponse<T = any> {
  ok: true;
  data: T;
}

/**
 * Standard error response
 */
export interface ErrorResponse {
  ok: false;
  error: {
    name: string;
    message: string;
    code?: string;
    details?: any;
  };
}

/**
 * Tool response union type
 */
export type ToolResponse<T = any> = SuccessResponse<T> | ErrorResponse;

/**
 * Helper to create success response
 */
export function successResponse<T>(data: T): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify({ ok: true, ...data }, null, 2) }],
  };
}

/**
 * Helper to create error response
 */
export function errorResponse(error: Error | unknown, code?: string): CallToolResult {
  const err = error instanceof Error
    ? { name: error.name, message: error.message }
    : { name: 'UnknownError', message: String(error) };

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          { ok: false, error: { ...err, ...(code ? { code } : {}) } },
          null,
          2
        ),
      },
    ],
    isError: true,
  };
}
