import { del } from '@vercel/blob';
import { HTTPException } from 'hono/http-exception';

import { type AppLogger, noopLogger } from '../interfaces/logger.interface.js';
import { organizationRepository } from '../repositories/organization.repository.js';
import {
  type CreateOrganizationPayload,
  SUBDOMAIN_REGEX,
  type UpdateOrganizationPayload,
} from '../schemas/organization.schema.js';

/**
 * Creates a new organization. Ensures the subdomain is valid and unique.
 * @param data - The organization fields
 * @param log - App logger that defaults to a blank logger
 * @returns The created organization
 */
export async function createOrganization(
  data: CreateOrganizationPayload,
  log: AppLogger = noopLogger,
) {
  const cleanSubdomain = data.subdomain.toLowerCase().trim();

  if (!SUBDOMAIN_REGEX.test(cleanSubdomain)) {
    throw new HTTPException(400, { message: 'Invalid subdomain format' });
  }

  const existingSubdomain = await organizationRepository.findBySubdomain(cleanSubdomain);
  if (existingSubdomain) {
    throw new HTTPException(409, { message: 'Subdomain already in use' });
  }

  const payload = {
    ...data,
    subDomainOverride: cleanSubdomain,
  };

  const newOrg = await organizationRepository.create(payload);
  log.info({ orgId: newOrg.id }, 'Organization created successfully');
  return newOrg;
}

/**
 * Updates an organization. Esures the subdomain is valid and unique.
 * @param id - The organization Id
 * @param data - The updated organization fields
 * @param log - App logger that defaults to a blank logger
 * @returns The updated organization
 */
export async function updateOrganization(
  id: string,
  data: UpdateOrganizationPayload,
  log: AppLogger = noopLogger,
) {
  const currentOrg = await organizationRepository.findById(id);
  if (!currentOrg) {
    throw new HTTPException(404, { message: 'Organization not found' });
  }

  const payload: Partial<CreateOrganizationPayload> & { subDomainOverride?: string } = { ...data };

  if (data.subdomain) {
    const cleanSubdomain = data.subdomain.toLowerCase().trim();
    if (!SUBDOMAIN_REGEX.test(cleanSubdomain)) {
      throw new HTTPException(400, { message: 'Invalid subdomain format' });
    }

    const existing = await organizationRepository.findBySubdomain(cleanSubdomain);
    if (existing && existing.id !== id) {
      throw new HTTPException(409, { message: 'Subdomain already in use' });
    }
    payload.subdomain = cleanSubdomain;
  }

  const hasSomeLocationField =
    data.address !== undefined ||
    data.city !== undefined ||
    data.state !== undefined ||
    data.country !== undefined ||
    data.zip !== undefined ||
    data.lat !== undefined ||
    data.lng !== undefined;

  if (hasSomeLocationField) {
    if (
      data.address === undefined ||
      data.city === undefined ||
      data.state === undefined ||
      data.country === undefined ||
      data.zip === undefined ||
      data.lat === undefined ||
      data.lng === undefined
    ) {
      throw new HTTPException(400, {
        message:
          'All physical location components (address, city, state, country, zip, lat, and lng) must be updated together.',
      });
    }
  }

  const updatedOrg = await organizationRepository.updateById(id, payload);
  if (!updatedOrg) {
    throw new HTTPException(500, { message: 'Failed to update organization details' });
  }

  if (data.image && currentOrg.image && currentOrg.image !== data.image) {
    del(currentOrg.image).catch((err) => {
      log.error(
        { error: err instanceof Error ? err.message : err, blobUrl: currentOrg.image },
        'Failed to remove orphaned organization image blob',
      );
    });
  }

  log.info({ orgId: id }, 'Organization details updated successfully');
  return updatedOrg;
}

/**
 * Deletes an organization and its profile image.
 * @param id - The organization Id
 * @param log - App logger that defaults to a blank logger
 */
export async function deleteOrganization(id: string, log: AppLogger = noopLogger) {
  const currentOrg = await organizationRepository.findById(id);
  if (!currentOrg) {
    throw new HTTPException(404, { message: 'Organization not found' });
  }

  const success = await organizationRepository.deleteById(id);
  if (!success) {
    throw new HTTPException(500, { message: 'Failed to delete organization' });
  }

  if (currentOrg.image) {
    del(currentOrg.image).catch((err) => {
      log.error(
        { error: err instanceof Error ? err.message : err, blobUrl: currentOrg.image },
        'Failed to remove organization image blob during organization deletion',
      );
    });
  }

  log.info({ orgId: id }, 'Organization removed successfully');
}

/**
 * Checks if a subdomain is in use, and offers an incremented alternate suggestion if unavailable.
 * @param subdomain - The subdomain to check
 * @returns Whether it is available and if not, a alternate subdomain suggestion
 */
export async function checkSubdomainAvailability(
  subdomain: string,
): Promise<{ available: boolean; suggestion?: string }> {
  const cleanSubdomain = subdomain.toLowerCase().trim();

  if (!SUBDOMAIN_REGEX.test(cleanSubdomain)) {
    throw new HTTPException(400, { message: 'Invalid subdomain format' });
  }

  const existing = await organizationRepository.findBySubdomain(cleanSubdomain);
  if (!existing) {
    return { available: true };
  }

  let counter = 1;
  while (true) {
    const suggestion = `${cleanSubdomain}${counter}`;
    const altExisting = await organizationRepository.findBySubdomain(suggestion);
    if (!altExisting) {
      return { available: false, suggestion };
    }
    counter++;

    if (counter > 100) {
      throw new HTTPException(500, { message: 'Unable to generate a unique subdomain suggestion' });
    }
  }
}

/**
 * Retrieves an organization by its ID.
 * @param id - The organization Id
 * @param log - App logger that defaults to a blank logger
 * @returns The organization
 */
export async function getOrganization(id: string, log: AppLogger = noopLogger) {
  const organization = await organizationRepository.findById(id);
  if (!organization) {
    throw new HTTPException(404, { message: 'Organization not found' });
  }

  log.info({ orgId: id }, 'Organization retrieved successfully');
  return organization;
}
