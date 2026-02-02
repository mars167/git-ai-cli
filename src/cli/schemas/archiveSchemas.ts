import { z } from 'zod';

export const PackIndexSchema = z.object({
  path: z.string().default('.'),
  lfs: z.boolean().default(false),
});

export const UnpackIndexSchema = z.object({
  path: z.string().default('.'),
});
