import { z } from 'zod';

export const ServeSchema = z.object({
  disableMcpLog: z.boolean().default(false),
  http: z.boolean().default(false),
  port: z.coerce.number().default(3000),
  stateless: z.boolean().default(false),
});

export const AgentInstallSchema = z.object({
  path: z.string().default('.'),
  to: z.string().optional(),
  agent: z.string().default('agents'),
  overwrite: z.boolean().default(false),
});
