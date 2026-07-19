import { HTTPException } from 'hono/http-exception';

import type { AppLogger } from '../interfaces/logger.interface.js';
import { clientRepository } from '../repositories/client.repository.js';
import type { CreateClientPayload, UpdateClientPayload } from '../schemas/client.schema.js';

/**
 * Create a new client.
 * @param userId - Current user Id
 * @param orgId - Current users organization
 * @param payload - The new client information
 * @param log - App logger that defaults to a blank logger
 * @returns The created client
 */
export async function createClient(
  userId: string,
  orgId: string,
  payload: CreateClientPayload,
  log: AppLogger,
) {
  log.info({ name: payload.name, orgId }, 'Initiating food pantry client creation');

  const client = await clientRepository.create({
    name: payload.name,
    email: payload.email,
    phone: payload.phone,
    address: payload.address,
    organizationId: orgId,
    createdById: userId,
  });

  let referredBy = null;

  if (payload.referrerId) {
    const referrer = await clientRepository.findById(payload.referrerId, orgId);
    if (referrer) {
      await clientRepository.createReferral(referrer.id, client.id);
      referredBy = {
        id: referrer.id,
        name: referrer.name,
        email: referrer.email,
        phone: referrer.phone,
      };
      log.info(
        { referrerId: referrer.id, referredId: client.id },
        'Client referral link established successfully via explicit ID',
      );
    } else {
      log.warn(
        { referrerId: payload.referrerId },
        'Referrer ID was specified but client record not found within organization',
      );
    }
  }

  return {
    ...client,
    referredBy,
  };
}

/**
 * Searches for referral candidates.
 * If a unique exact match exists (by exact email or exact phone), it filters down to only that one.
 * Otherwise, it returns top fuzzy match candidate combinations.
 * @param orgId - The organization to search within
 * @param queryStr - The search string (e.g, name, email, phone)
 * @param log - App logger that defaults to a blank logger
 * @returns A list of clients
 */
export async function searchReferrerCandidates(orgId: string, queryStr: string, log: AppLogger) {
  log.debug({ orgId, queryStr }, 'Searching for referral candidates');
  const cleanQuery = queryStr.trim();

  const exactMatches = await clientRepository.findExactMatches(orgId, cleanQuery);

  if (exactMatches.length === 1) {
    return {
      exactMatch: true,
      results: exactMatches,
    };
  }

  const fuzzyCandidates = await clientRepository.findFuzzyCandidates(orgId, cleanQuery);
  return {
    exactMatch: false,
    results: fuzzyCandidates,
  };
}

/**
 * Get a list of clients for an organization.
 * @param orgId - The organization Id
 * @param params - Search parameters
 * @param params.search - A search string
 * @param params.active - Filter by active status
 * @param params.page - The current pagination page
 * @param params.limit - Max number of results
 * @param params.offset - The offset index to start at
 * @param log - App logger that defaults to a blank logger
 * @returns A list of clients
 */
export async function getClients(
  orgId: string,
  params: {
    search?: string;
    active?: boolean;
    page: number;
    limit: number;
    offset: number;
  },
  log: AppLogger,
) {
  log.debug({ orgId, params }, 'Fetching client registry with pagination and filters');

  const { items, total } = await clientRepository.getList({
    orgId,
    search: params.search,
    active: params.active,
    limit: params.limit,
    offset: params.offset,
  });

  const enrichedItems = await Promise.all(
    items.map(async (client) => {
      const referredBy = await clientRepository.findReferredBy(client.id);
      return {
        ...client,
        referredBy,
      };
    }),
  );

  return {
    items: enrichedItems,
    total,
  };
}

/**
 * Updates a client.
 * @param id - The client being updated
 * @param orgId - The clients organization
 * @param payload - The new client information
 * @param log - App logger that defaults to a blank logger
 * @returns The updated client
 */
export async function updateClient(
  id: string,
  orgId: string,
  payload: UpdateClientPayload,
  log: AppLogger,
) {
  const existing = await clientRepository.findById(id, orgId);
  if (!existing) {
    throw new HTTPException(404, { message: 'Client not found' });
  }

  const updated = await clientRepository.update(id, orgId, payload);
  if (!updated) {
    throw new HTTPException(500, { message: 'Failed to update client' });
  }

  const referredBy = await clientRepository.findReferredBy(id);

  log.info({ clientId: id, orgId }, 'Client details updated');
  return {
    ...updated,
    referredBy,
  };
}

/**
 * Deactivates a client by setting their active status to false.
 * @param id - The client Id
 * @param orgId - The clients organization
 * @param log - App logger that defaults to a blank logger
 * @returns The updated client
 */
export async function deactivateClient(id: string, orgId: string, log: AppLogger) {
  const existing = await clientRepository.findById(id, orgId);
  if (!existing) {
    throw new HTTPException(404, { message: 'Client not found' });
  }

  const updated = await clientRepository.setActiveStatus(id, orgId, false);
  if (!updated) {
    throw new HTTPException(500, { message: 'Failed to deactivate client' });
  }

  const referredBy = await clientRepository.findReferredBy(id);

  log.info({ clientId: id, orgId }, 'Client status set to inactive');
  return {
    ...updated,
    referredBy,
  };
}

/**
 * Deletes a client.
 * @param id - The client Id
 * @param orgId - The clients organization
 * @param log - App logger that defaults to a blank logger
 * @returns True if the deletion was successful
 */
export async function deleteClient(id: string, orgId: string, log: AppLogger) {
  const existing = await clientRepository.findById(id, orgId);
  if (!existing) {
    throw new HTTPException(404, { message: 'Client not found' });
  }

  const success = await clientRepository.delete(id, orgId);
  if (!success) {
    throw new HTTPException(500, { message: 'Failed to remove client record' });
  }

  log.info({ clientId: id, orgId }, 'Client permanently removed from database');
  return { success: true };
}
