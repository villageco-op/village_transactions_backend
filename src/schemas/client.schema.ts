import { z } from '@hono/zod-openapi';
import { createSelectSchema } from 'drizzle-zod';

import { clients, referrals } from '../db/schema.js';

import { EntityIdField, PaginationQuerySchema } from './common.schema.js';
import { createPaginatedResponseSchema } from './util/pagination.js';

export const BaseClientSchema = createSelectSchema(clients).openapi('Client');
export const BaseReferralSchema = createSelectSchema(referrals).openapi('Referral');

export const SearchReferrerQuerySchema = z
  .object({
    q: z.string().min(1, 'Search query is required').openapi({
      description: 'Search string matching name, email, or phone number',
      example: 'Jane Smith',
    }),
  })
  .openapi('SearchReferrerQuery');

export const SearchReferrerResponseSchema = z
  .object({
    exactMatch: z.boolean(),
    results: z.array(
      z.object({
        id: EntityIdField,
        name: z.string(),
        email: z.string().nullable(),
        phone: z.string().nullable(),
      }),
    ),
  })
  .openapi('SearchReferrerResponse');

export const CreateClientSchema = z
  .object({
    name: z.string().min(1, 'Name is required').openapi({ example: 'John Doe' }),
    email: z.string().email().optional().openapi({ example: 'johndoe@example.com' }),
    phone: z.string().optional().openapi({ example: '+15551234567' }),
    address: z.string().optional().openapi({ example: '123 Main St, Springfield' }),
    city: z.string().optional().openapi({ example: 'Madison' }),
    state: z.string().optional().openapi({ example: 'WI' }),
    country: z.string().optional().openapi({ example: 'United States of America' }),
    zip: z.string().optional().openapi({ example: '54751' }),
    referrerId: EntityIdField.optional().openapi({
      description: 'The explicit client ID of an existing client who referred this client',
      example: 'a6ccf67a-1ce9-4bba-95df-32efef42d2a4',
    }),
  })
  .openapi('CreateClientPayload');

export const UpdateClientSchema = z
  .object({
    name: z.string().min(1, 'Name is required').optional(),
    email: z.string().email().optional().nullable(),
    phone: z.string().optional().nullable(),
    address: z.string().optional().nullable().openapi({ example: '123 Main St, Springfield' }),
    city: z.string().optional().openapi({ example: 'Madison' }),
    state: z.string().optional().openapi({ example: 'WI' }),
    country: z.string().optional().openapi({ example: 'United States of America' }),
    zip: z.string().optional().openapi({ example: '54751' }),
  })
  .openapi('UpdateClientPayload');

export const GetClientsQuerySchema = z
  .object({
    search: z.string().optional().openapi({
      description: 'Filter clients by name, email, or phone number',
      example: 'John',
    }),
    active: z
      .preprocess((val) => {
        if (val === 'true') return true;
        if (val === 'false') return false;
        return val;
      }, z.boolean().optional())
      .openapi({
        description: 'Filter clients by active status',
        type: 'boolean',
        example: true,
      }),
  })
  .extend(PaginationQuerySchema.shape)
  .openapi('GetClientsQuery');

export const ClientResponseSchema = BaseClientSchema.extend({
  referredBy: z
    .object({
      id: EntityIdField,
      name: z.string(),
      email: z.string().nullable(),
      phone: z.string().nullable(),
    })
    .nullable()
    .openapi('ReferredBy'),
}).openapi('ClientResponse');

export const ClientsListResponseSchema = createPaginatedResponseSchema(
  ClientResponseSchema,
  'ClientsListResponse',
);

export const GetReferralsQuerySchema = z
  .object({})
  .extend(PaginationQuerySchema.shape)
  .openapi('GetReferralsQuery');

export type CreateClientPayload = z.infer<typeof CreateClientSchema>;
export type UpdateClientPayload = z.infer<typeof UpdateClientSchema>;
