import { z } from 'zod';

export const DsrContextSchema = z.object({
  path: z.string().default('.'),
  json: z.boolean().default(false),
});

export const DsrGenerateSchema = z.object({
  commit: z.string().min(1, 'Commit hash is required'),
  path: z.string().default('.'),
  json: z.boolean().default(false),
});

export const DsrRebuildIndexSchema = z.object({
  path: z.string().default('.'),
  json: z.boolean().default(false),
});

export const DsrSymbolEvolutionSchema = z.object({
  symbol: z.string().min(1, 'Symbol name is required'),
  path: z.string().default('.'),
  all: z.boolean().default(false),
  start: z.string().optional(),
  limit: z.coerce.number().int().positive().default(200),
  contains: z.boolean().default(false),
  json: z.boolean().default(false),
});
