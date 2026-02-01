import { z } from 'zod';

const LangEnum = z.enum(['auto', 'all', 'java', 'ts']);

export const AstGraphQueryArgsSchema = z.object({
  path: z.string().min(1, 'path is required'),
  query: z.string().min(1, 'query is required'),
  params: z.any().default({}),
});

export type AstGraphQueryArgs = z.infer<typeof AstGraphQueryArgsSchema>;

export const AstGraphFindArgsSchema = z.object({
  path: z.string().min(1, 'path is required'),
  prefix: z.string().min(1, 'prefix is required'),
  limit: z.number().int().positive().default(50),
  lang: LangEnum.default('auto'),
});

export type AstGraphFindArgs = z.infer<typeof AstGraphFindArgsSchema>;

export const AstGraphChildrenArgsSchema = z.object({
  path: z.string().min(1, 'path is required'),
  id: z.string().min(1, 'id is required'),
  as_file: z.boolean().default(false),
});

export type AstGraphChildrenArgs = z.infer<typeof AstGraphChildrenArgsSchema>;

export const AstGraphRefsArgsSchema = z.object({
  path: z.string().min(1, 'path is required'),
  name: z.string().min(1, 'name is required'),
  limit: z.number().int().positive().default(200),
  lang: LangEnum.default('auto'),
});

export type AstGraphRefsArgs = z.infer<typeof AstGraphRefsArgsSchema>;

export const AstGraphCallersArgsSchema = z.object({
  path: z.string().min(1, 'path is required'),
  name: z.string().min(1, 'name is required'),
  limit: z.number().int().positive().default(200),
  lang: LangEnum.default('auto'),
});

export type AstGraphCallersArgs = z.infer<typeof AstGraphCallersArgsSchema>;

export const AstGraphCalleesArgsSchema = z.object({
  path: z.string().min(1, 'path is required'),
  name: z.string().min(1, 'name is required'),
  limit: z.number().int().positive().default(200),
  lang: LangEnum.default('auto'),
});

export type AstGraphCalleesArgs = z.infer<typeof AstGraphCalleesArgsSchema>;

export const AstGraphChainArgsSchema = z.object({
  path: z.string().min(1, 'path is required'),
  name: z.string().min(1, 'name is required'),
  direction: z.enum(['downstream', 'upstream']).default('downstream'),
  max_depth: z.number().int().positive().default(3),
  limit: z.number().int().positive().default(500),
  min_name_len: z.number().int().min(1).default(1),
  lang: LangEnum.default('auto'),
});

export type AstGraphChainArgs = z.infer<typeof AstGraphChainArgsSchema>;
