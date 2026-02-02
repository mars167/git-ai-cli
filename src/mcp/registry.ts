import type { ToolDefinition, ToolHandler, ToolContext } from './types';
import { errorResponse } from './types';
import { ZodSchema } from 'zod';

export class ToolRegistry {
  private tools = new Map<string, { definition: ToolDefinition; schema?: ZodSchema }>();

  register(definition: ToolDefinition, schema?: ZodSchema): void {
    this.tools.set(definition.name, { definition, schema });
  }

  async execute(name: string, args: unknown, context: ToolContext) {
    const tool = this.tools.get(name);
    if (!tool) {
      return errorResponse(new Error(`Tool '${name}' not found`), 'TOOL_NOT_FOUND');
    }

    try {
      const validatedArgs = tool.schema ? tool.schema.parse(args) : args;
      return await tool.definition.handler(validatedArgs, context);
    } catch (error) {
      if (error && typeof error === 'object' && 'errors' in error) {
        const zodError = error as { errors: Array<{ path: string[]; message: string }> };
        const messages = zodError.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
        return errorResponse(new Error(`Validation failed: ${messages}`), 'VALIDATION_ERROR');
      }
      return errorResponse(error, 'HANDLER_ERROR');
    }
  }

  listTools() {
    return Array.from(this.tools.values()).map(t => ({
      name: t.definition.name,
      description: t.definition.description,
      inputSchema: t.definition.inputSchema,
    }));
  }
}
