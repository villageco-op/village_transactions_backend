import { del } from '@vercel/blob';
import { HTTPException } from 'hono/http-exception';

import type { OrgRole } from '../db/types.js';
import { type AppLogger, noopLogger } from '../interfaces/logger.interface.js';
import { organizationRepository } from '../repositories/organization.repository.js';
import { userRepository } from '../repositories/user.repository.js';
import {
  type CreateOrganizationPayload,
  SUBDOMAIN_REGEX,
  type UpdateOrganizationPayload,
} from '../schemas/organization.schema.js';

import { renderBrandedLayout } from './email/template.js';
import { emailService } from './email.service.js';
import { sendPushNotification } from './notification.service.js';
import { removeOrganizationFromUsers } from './user.service.js';

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

  let maxReferrals;
  if (data.type === 'pantry') {
    maxReferrals = data.maxReferrals || 4;
  }

  const payload = {
    ...data,
    subDomainOverride: cleanSubdomain,
    maxReferrals,
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
 * Deletes an organization, disassociates connected users, and removes its profile image.
 * @param id - The organization Id
 * @param log - App logger that defaults to a blank logger
 */
export async function deleteOrganization(id: string, log: AppLogger = noopLogger) {
  const currentOrg = await organizationRepository.findById(id);
  if (!currentOrg) {
    throw new HTTPException(404, { message: 'Organization not found' });
  }

  await removeOrganizationFromUsers(id, log);

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

/**
 * Removes a user from an organization. Checks that the caller is an admin of the same org.
 * @param callerId - The calling users Id
 * @param targetUserId - The Id of the user being updated
 * @param log - App logger that defaults to a blank logger
 * @returns Success status
 */
export async function removeUserFromOrganization(
  callerId: string,
  targetUserId: string,
  log: AppLogger = noopLogger,
) {
  const caller = await userRepository.findById(callerId);
  if (!caller) {
    throw new HTTPException(401, { message: 'Caller not found' });
  }

  if (caller.orgRole !== 'admin' || !caller.organizationId) {
    throw new HTTPException(403, { message: 'Insufficient organization permissions' });
  }

  const targetUser = await userRepository.findById(targetUserId);
  if (!targetUser) {
    throw new HTTPException(404, { message: 'Target user not found' });
  }

  if (targetUser.organizationId !== caller.organizationId) {
    throw new HTTPException(403, { message: 'User does not belong to your organization' });
  }

  const updatedTarget = await userRepository.removeFromOrganization(targetUserId);
  if (!updatedTarget) {
    throw new HTTPException(500, { message: 'Failed to disassociate user from organization' });
  }

  const org = await organizationRepository.findById(caller.organizationId);
  const orgName = org?.name || 'the organization';

  if (targetUser.email) {
    const emailResult = await emailService.send(
      {
        to: targetUser.email,
        subject: `Membership ended at ${orgName}`,
        text: `Hi ${targetUser.name || 'there'},\n\nWe are writing to inform you that you have been removed from the organization "${orgName}" by an administrator.\n\nBest regards,\nThe Village Team`,
      },
      log,
    );

    if (emailResult.success) {
      log.info({ targetUserId }, 'Removal notification email sent');
    }
  }

  try {
    await sendPushNotification(
      targetUserId,
      'Organization Update',
      `You have been removed from ${orgName}`,
      log,
    );
  } catch (err) {
    log.error(
      { error: err instanceof Error ? err.message : err },
      'Failed to dispatch push notification',
    );
  }

  return { success: true };
}

/**
 * Updates a user's role within an organization. Checks that the caller is an admin of the same org.
 * @param callerId - The calling users Id
 * @param targetUserId - The Id of the user being updated
 * @param newRole - The new role for the user
 * @param log - App logger that defaults to a blank logger
 * @returns The updated target user
 */
export async function updateUserRoleInOrganization(
  callerId: string,
  targetUserId: string,
  newRole: OrgRole,
  log: AppLogger = noopLogger,
) {
  const caller = await userRepository.findById(callerId);
  if (!caller) {
    throw new HTTPException(401, { message: 'Caller not found' });
  }

  if (caller.orgRole !== 'admin' || !caller.organizationId) {
    throw new HTTPException(403, { message: 'Insufficient organization permissions' });
  }

  const targetUser = await userRepository.findById(targetUserId);
  if (!targetUser) {
    throw new HTTPException(404, { message: 'Target user not found' });
  }

  if (targetUser.organizationId !== caller.organizationId) {
    throw new HTTPException(403, { message: 'User does not belong to your organization' });
  }

  const updatedTarget = await userRepository.updateOrgAndRole(
    targetUserId,
    caller.organizationId,
    newRole,
  );

  if (!updatedTarget) {
    throw new HTTPException(500, { message: 'Failed to update user role' });
  }

  const org = await organizationRepository.findById(caller.organizationId);
  const orgName = org?.name || 'the organization';

  if (targetUser.email) {
    const text = `Hi ${targetUser.name || 'there'},\n\nYour organization role in "${orgName}" has been updated to "${newRole}" by an administrator.\n\nBest regards,\nThe Village Team`;
    const formattedText = text.replace(/\n/g, '<br>');
    const header = `Your role was updated in ${orgName}`;
    const bodyContent = `
      <h2 style="margin-top: 0;">${header}</h2>
      <p>${formattedText}</p>
    `;

    const { success } = await emailService.send(
      {
        to: targetUser.email,
        subject: `Role Updated in ${orgName}`,
        text: text,
        html: renderBrandedLayout(bodyContent),
      },
      log,
    );

    if (success) {
      log.info({ targetUserId, newRole }, 'Role update notification email sent');
    }
  }

  try {
    await sendPushNotification(
      targetUserId,
      'Role Updated',
      `Your role in ${orgName} has been updated to ${newRole}`,
      log,
    );
  } catch (err) {
    log.error(
      { error: err instanceof Error ? err.message : err },
      'Failed to dispatch push notification',
    );
  }

  return updatedTarget;
}

/**
 * Retrieves a paginated and filtered list of organization members.
 * @param params - Configuration options for retrieving organization members.
 * @param params.orgId - The organization Id
 * @param params.search - Search by user name or email
 * @param params.role - Filter by user organization role
 * @param params.page
 * @param params.limit - Maximum number of results
 * @param params.offset - Pagination start index
 * @param log - App logger that defaults to a blank logger
 * @returns Paginated results containing the data array and response metadata.
 */
export async function getOrganizationMembers(
  params: {
    orgId: string;
    search?: string;
    role?: OrgRole;
    page: number;
    limit: number;
    offset: number;
  },
  log: AppLogger = noopLogger,
) {
  const currentOrg = await organizationRepository.findById(params.orgId);
  if (!currentOrg) {
    throw new HTTPException(404, { message: 'Organization not found' });
  }

  const { items, total } = await userRepository.getMembers(params);

  log.info({ orgId: params.orgId, total }, 'Retrieved organization members list');

  return {
    data: items,
    meta: {
      total,
      page: params.page,
      limit: params.limit,
      totalPages: Math.ceil(total / (params.limit || 1)),
    },
  };
}
