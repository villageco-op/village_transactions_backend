import { z } from '@hono/zod-openapi';

export const ContactRequestSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.email('A valid email is required'),
  company: z.string().optional(),
  message: z.string().min(1, 'Message is required'),
});

export type ContactPayload = z.infer<typeof ContactRequestSchema>;
