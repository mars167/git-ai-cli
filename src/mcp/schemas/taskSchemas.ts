import { z } from 'zod';

export const LexicalSearchArgsSchema = z.object({
  path: z.string().min(1, 'path is required'),
  query: z.string().min(1, 'query is required'),
  mode: z.enum(['exact', 'substring', 'regex', 'literal']).default('substring'),
  lang: z.enum(['all', 'ts', 'java', 'python', 'go', 'rust', 'c', 'markdown', 'yaml']).default('all'),
  path_pattern: z.string().optional(),
  limit: z.number().int().positive().default(50),
});

const TaskBaseArgsSchema = z.object({
  path: z.string().min(1, 'path is required'),
  query: z.string().optional(),
  path_hints: z.array(z.string()).optional(),
  symbol_hints: z.array(z.string()).optional(),
});

export const ImplementationContextArgsSchema = TaskBaseArgsSchema;
export const FindTestsArgsSchema = TaskBaseArgsSchema;
export const FindImpactArgsSchema = TaskBaseArgsSchema;
export const FindExtensionPointsArgsSchema = TaskBaseArgsSchema;

export const ReviewContextForDiffArgsSchema = TaskBaseArgsSchema.extend({
  diff_text: z.string().min(1, 'diff_text is required'),
});

export type LexicalSearchArgs = z.infer<typeof LexicalSearchArgsSchema>;
export type ImplementationContextArgs = z.infer<typeof ImplementationContextArgsSchema>;
export type FindTestsArgs = z.infer<typeof FindTestsArgsSchema>;
export type FindImpactArgs = z.infer<typeof FindImpactArgsSchema>;
export type FindExtensionPointsArgs = z.infer<typeof FindExtensionPointsArgsSchema>;
export type ReviewContextForDiffArgs = z.infer<typeof ReviewContextForDiffArgsSchema>;
