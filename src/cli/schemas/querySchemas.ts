import { z } from 'zod';

const languageEnum = z.enum(['auto', 'all', 'java', 'ts', 'python', 'go', 'rust', 'c', 'markdown', 'yaml']);
const searchModeEnum = z.enum(['substring', 'prefix', 'wildcard', 'regex', 'fuzzy']);

export const SearchSymbolsSchema = z.object({
  keyword: z.string().min(1, 'Keyword is required'),
  path: z.string().default('.'),
  limit: z.coerce.number().int().positive().default(50),
  mode: searchModeEnum.optional(),
  caseInsensitive: z.boolean().default(false),
  maxCandidates: z.coerce.number().int().positive().default(1000),
  lang: languageEnum.default('auto'),
  withRepoMap: z.boolean().default(false),
  repoMapFiles: z.coerce.number().int().positive().default(20),
  repoMapSymbols: z.coerce.number().int().positive().default(5),
  wiki: z.string().default(''),
});
