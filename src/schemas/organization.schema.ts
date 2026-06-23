import { z } from '@hono/zod-openapi';
import { createSelectSchema } from 'drizzle-zod';

import { organizations } from '../db/schema.js';

import { LatitudeSchema, LongitudeSchema, OrgTypeSchema } from './common.schema.js';

export const BaseOrganizationSchema = createSelectSchema(organizations).omit({
  location: true,
});

export const OrganizationSchema = BaseOrganizationSchema.extend({
  type: OrgTypeSchema,
}).openapi('Organization');

export const SUBDOMAIN_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const RawOrganizationSchema = z.object({
  name: z.string().min(1, 'Name is required').openapi({ example: 'My Community Pantry' }),
  type: OrgTypeSchema,
  address: z.string().min(1, 'Address is required').openapi({ example: '123 Main St' }),
  city: z.string().min(1, 'City is required').openapi({ example: 'Madison' }),
  state: z.string().min(1, 'State is required').openapi({ example: 'WI' }),
  country: z.string().min(1, 'Country is required').openapi({ example: 'United States' }),
  zip: z.string().min(1, 'Zip code is required').openapi({ example: '53703' }),
  lat: LatitudeSchema,
  lng: LongitudeSchema,
  subdomain: z
    .string()
    .min(1, 'Subdomain is required')
    .min(3, 'Subdomain must be at least 3 characters long')
    .max(63, 'Subdomain must be at most 63 characters long')
    .regex(
      SUBDOMAIN_REGEX,
      'Subdomain must contain only lowercase letters, numbers, and hyphens, and cannot start or end with a hyphen',
    )
    .openapi({
      description: 'Unique subdomain prefix',
      example: 'mypantry',
    }),
  email: z.string().email().optional().openapi({ example: 'info@mypantry.org' }),
  website: z.string().url().optional().openapi({ example: 'https://mypantry.org' }),
  phone: z.string().optional().openapi({ example: '+16085550199' }),
  image: z.string().url().optional().openapi({ example: 'https://blob.vercel.com/org-photo.png' }),
});

export const CreateOrganizationSchema = RawOrganizationSchema.openapi('CreateOrganizationPayload');

export const UpdateOrganizationSchema = RawOrganizationSchema.partial().openapi(
  'UpdateOrganizationPayload',
);

export const CheckSubdomainQuerySchema = z.object({
  subdomain: z
    .string()
    .min(1, 'Subdomain parameter is required')
    .regex(
      SUBDOMAIN_REGEX,
      'Subdomain must contain only lowercase letters, numbers, and hyphens, and cannot start or end with a hyphen',
    )
    .openapi('CheckSubdomainQuery', {
      param: {
        name: 'subdomain',
        in: 'query',
      },
      example: 'mypantry',
    }),
});

export const CheckSubdomainResponseSchema = z
  .object({
    available: z.boolean(),
    suggestion: z.string().optional(),
  })
  .openapi('CheckSubdomainResponse');

export type UpdateOrganizationPayload = z.infer<typeof UpdateOrganizationSchema>;
export type CreateOrganizationPayload = z.infer<typeof CreateOrganizationSchema>;
