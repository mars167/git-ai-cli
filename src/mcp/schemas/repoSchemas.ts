import { z } from 'zod';

/**
 * Schema for get_repo tool
 */
export const GetRepoArgsSchema = z.object({
  path: z.string().min(1, 'path is required'),
});

export type GetRepoArgs = z.infer<typeof GetRepoArgsSchema>;

/**
 * Schema for check_index tool
 */
export const CheckIndexArgsSchema = z.object({
  path: z.string().min(1, 'path is required'),
});

export type CheckIndexArgs = z.infer<typeof CheckIndexArgsSchema>;

/**
 * Schema for rebuild_index tool
 */
export const RebuildIndexArgsSchema = z.object({
  path: z.string().min(1, 'path is required'),
  dim: z.number().int().positive().default(256),
  overwrite: z.boolean().default(true),
});

export type RebuildIndexArgs = z.infer<typeof RebuildIndexArgsSchema>;

/**
 * Schema for pack_index tool
 */
export const PackIndexArgsSchema = z.object({
  path: z.string().min(1, 'path is required'),
  lfs: z.boolean().default(false),
});

export type PackIndexArgs = z.infer<typeof PackIndexArgsSchema>;

/**
 * Schema for unpack_index tool
 */
export const UnpackIndexArgsSchema = z.object({
  path: z.string().min(1, 'path is required'),
});

export type UnpackIndexArgs = z.infer<typeof UnpackIndexArgsSchema>;
