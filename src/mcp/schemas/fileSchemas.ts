import { z } from 'zod';

export const ListFilesArgsSchema = z.object({
  path: z.string().min(1, 'path is required'),
  pattern: z.string().default('**/*'),
  limit: z.number().int().positive().default(500),
});

export type ListFilesArgs = z.infer<typeof ListFilesArgsSchema>;

export const ReadFileArgsSchema = z.object({
  path: z.string().min(1, 'path is required'),
  file: z.string().min(1, 'file is required'),
  start_line: z.number().int().positive().default(1),
  end_line: z.number().int().positive().default(200),
});

export type ReadFileArgs = z.infer<typeof ReadFileArgsSchema>;
