import { z } from 'zod';

export const InstallHooksSchema = z.object({
  path: z.string().default('.'),
});

export const UninstallHooksSchema = z.object({
  path: z.string().default('.'),
});

export const HooksStatusSchema = z.object({
  path: z.string().default('.'),
});
