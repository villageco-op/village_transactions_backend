import { z } from '@hono/zod-openapi';

export const ContactRequestSchema = z
  .object({
    name: z.string().min(1, 'Name is required').openapi({
      example: 'Jane Doe',
      description: 'Full name of the person submitting the inquiry',
    }),
    email: z.email('A valid email is required').openapi({
      example: 'jane@example.com',
      description: 'Contact email address',
    }),
    company: z.string().optional().openapi({
      example: 'Fresh Eats LLC',
      description: 'Optional company or organization name',
    }),
    message: z.string().min(1, 'Message is required').openapi({
      example: 'I am interested in bulk purchasing.',
      description: 'The content of the contact request',
    }),
    website: z.string().optional().openapi({
      example: '',
      description: 'Honeypot anti-spam field. Must be empty for legitimate users.',
    }),
  })
  .openapi('ContactPayload');

export type ContactPayload = z.infer<typeof ContactRequestSchema>;
