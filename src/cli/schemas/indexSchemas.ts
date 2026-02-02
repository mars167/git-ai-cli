import { z } from 'zod';

export const IndexRepoSchema = z.object({
  path: z.string().default('.'),
  dim: z.coerce.number().int().positive().default(256),
  overwrite: z.boolean().default(false),
  incremental: z.boolean().default(false),
  staged: z.boolean().default(false),
});
