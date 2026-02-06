import { z } from 'zod';

export const RepoMapSchema = z.object({
  path: z.string().default('.'),
  maxFiles: z.coerce.number().int().positive().default(20),
  maxSymbols: z.coerce.number().int().positive().default(5),
  depth: z.coerce.number().int().min(1).max(20).default(5),
  maxNodes: z.coerce.number().int().positive().default(5000),
  wiki: z.string().default(''),
});

export type RepoMapInput = z.infer<typeof RepoMapSchema>;
