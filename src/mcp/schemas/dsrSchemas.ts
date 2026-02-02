import { z } from 'zod';

export const DsrContextArgsSchema = z.object({
  path: z.string().min(1, 'path is required'),
});

export type DsrContextArgs = z.infer<typeof DsrContextArgsSchema>;

export const DsrGenerateArgsSchema = z.object({
  path: z.string().min(1, 'path is required'),
  commit: z.string().default('HEAD'),
});

export type DsrGenerateArgs = z.infer<typeof DsrGenerateArgsSchema>;

export const DsrRebuildIndexArgsSchema = z.object({
  path: z.string().min(1, 'path is required'),
});

export type DsrRebuildIndexArgs = z.infer<typeof DsrRebuildIndexArgsSchema>;

export const DsrSymbolEvolutionArgsSchema = z.object({
  path: z.string().min(1, 'path is required'),
  symbol: z.string().min(1, 'symbol is required'),
  start: z.string().optional(),
  all: z.boolean().default(false),
  limit: z.number().int().positive().default(200),
  contains: z.boolean().default(false),
});

export type DsrSymbolEvolutionArgs = z.infer<typeof DsrSymbolEvolutionArgsSchema>;
