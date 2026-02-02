import { z } from 'zod';

const languageEnum = z.enum(['auto', 'all', 'java', 'ts', 'python', 'go', 'rust', 'c', 'markdown', 'yaml']);

export const GraphQuerySchema = z.object({
  scriptParts: z.array(z.string()).min(1, 'Query script is required'),
  path: z.string().default('.'),
  params: z.string().default('{}'),
});

export const FindSymbolsSchema = z.object({
  prefix: z.string().min(1, 'Prefix is required'),
  path: z.string().default('.'),
  lang: languageEnum.default('auto'),
});

export const GraphChildrenSchema = z.object({
  id: z.string().min(1, 'Parent id is required'),
  path: z.string().default('.'),
  asFile: z.boolean().default(false),
});

export const GraphRefsSchema = z.object({
  name: z.string().min(1, 'Symbol name is required'),
  path: z.string().default('.'),
  limit: z.coerce.number().int().positive().default(200),
  lang: languageEnum.default('auto'),
});

export const GraphCallersSchema = z.object({
  name: z.string().min(1, 'Callee name is required'),
  path: z.string().default('.'),
  limit: z.coerce.number().int().positive().default(200),
  lang: languageEnum.default('auto'),
});

export const GraphCalleesSchema = z.object({
  name: z.string().min(1, 'Caller name is required'),
  path: z.string().default('.'),
  limit: z.coerce.number().int().positive().default(200),
  lang: languageEnum.default('auto'),
});

export const GraphChainSchema = z.object({
  name: z.string().min(1, 'Start symbol name is required'),
  path: z.string().default('.'),
  direction: z.enum(['downstream', 'upstream']).default('downstream'),
  depth: z.coerce.number().int().positive().default(3),
  limit: z.coerce.number().int().positive().default(500),
  minNameLen: z.coerce.number().int().min(1).default(1),
  lang: languageEnum.default('auto'),
});
