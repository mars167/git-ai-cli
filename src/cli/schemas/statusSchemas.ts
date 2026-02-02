import { z } from 'zod';

export const CheckIndexSchema = z.object({
  path: z.string().default('.'),
});

export const StatusSchema = z.object({
  path: z.string().default('.'),
  json: z.boolean().default(false),
});
