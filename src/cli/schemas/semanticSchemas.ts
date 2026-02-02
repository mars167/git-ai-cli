import { z } from 'zod';

const languageEnum = z.enum(['auto', 'all', 'java', 'ts', 'python', 'go', 'rust', 'c', 'markdown', 'yaml']);

export const SemanticSearchSchema = z.object({
  text: z.string().min(1, 'Query text is required'),
  path: z.string().default('.'),
  topk: z.coerce.number().int().positive().default(10),
  lang: languageEnum.default('auto'),
  withRepoMap: z.boolean().default(false),
  repoMapFiles: z.coerce.number().int().positive().default(20),
  repoMapSymbols: z.coerce.number().int().positive().default(5),
  wiki: z.string().default(''),
});
