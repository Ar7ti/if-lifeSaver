import { z } from 'zod';

export const SessionResponseSchema = z.object({
  mode: z.enum(['legacy', 'public']),
  session: z.object({ id: z.string(), role: z.enum(['anonymous', 'admin']), expiresAt: z.string().datetime() }).nullable(),
  // This is a CSRF nonce, NOT the HttpOnly session credential.
  csrfToken: z.string().nullable(),
  usage: z.object({ used: z.number().int(), limit: z.number().int().nullable(), remaining: z.number().int().nullable(), resetsAt: z.string().datetime(), publicAiEnabled: z.boolean() }).nullable(),
}).strict();
export type SessionResponse = z.infer<typeof SessionResponseSchema>;
export const ProjectListResponseSchema = z.object({ projects: z.array(z.object({
  id: z.string().uuid(), title: z.string(), location: z.string().nullable(), totalMinor: z.number().int(), committedMinor: z.number().int(), tasksDone: z.number().int(), tasksTotal: z.number().int(), updatedAt: z.string().datetime(),
}).strict()) }).strict();
