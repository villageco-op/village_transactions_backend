import crypto from 'node:crypto';

import { HTTPException } from 'hono/http-exception';

import type { OrgInviteStatus, OrgRole } from '../db/types.js';
import type { AppLogger } from '../interfaces/logger.interface.js';
import { inviteRepository } from '../repositories/invite.repository.js';
import { organizationRepository } from '../repositories/organization.repository.js';
import { transactionRepository } from '../repositories/transaction.repository.js';
import { userRepository } from '../repositories/user.repository.js';

import { DEFAULT_BRANDING, renderBrandedLayout } from './email/template.js';
import { emailService } from './email.service.js';

/**
 * Creates an invite record and sends an notification email.
 * @param callerUserId - The user creating the invite
 * @param payload - The invite payload
 * @param payload.email - The invited users email
 * @param payload.role - The invited users assigned role
 * @param log - App logger that defaults to a blank logger
 * @returns Success status and the invite Id
 */
export async function createOrgInvite(
  callerUserId: string,
  payload: { email: string; role: OrgRole },
  log: AppLogger,
) {
  const callerUser = await userRepository.findById(callerUserId);

  if (!callerUser || !callerUser.organizationId) {
    throw new HTTPException(400, { message: 'Caller is not associated with any organization' });
  }

  const organizationId = callerUser.organizationId;
  const inviteCode = crypto.randomBytes(24).toString('hex');
  const inviteId = crypto.randomUUID();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // Code valid for 7 days

  await inviteRepository.upsert({
    id: inviteId,
    email: payload.email,
    orgId: organizationId,
    code: inviteCode,
    role: payload.role,
    expiresAt,
  });

  const organization = await organizationRepository.findById(organizationId);

  const frontendUrl = process.env.FRONTEND_URL || 'https://villageco-op.com';
  const inviteLink = `${frontendUrl}/verify-invite?org=${organizationId}&code=${inviteCode}&email=${encodeURIComponent(payload.email)}`;

  const text = `You've been invited to join ${organization?.name || 'an organization'}.\n\nClick the link below to accept the invitation:\n${inviteLink}\n\nThis invitation link will expire in 7 days.`;

  const bodyContent = `
    <h2 style="margin-top: 0; color: ${DEFAULT_BRANDING.textColor};">You've been invited to join ${organization?.name || 'an organization'}</h2>
    <p style="margin-bottom: 24px;">Click the button below to accept your invitation to join. This link will expire in 7 days.</p>
    <table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin: 28px 0;">
      <tr>
        <td align="center" style="border-radius: 6px; background-color: ${DEFAULT_BRANDING.primaryColor};">
          <a href="${inviteLink}" target="_blank" style="font-size: 16px; font-weight: bold; color: ${DEFAULT_BRANDING.buttonTextColor}; text-decoration: none; border-radius: 6px; padding: 12px 24px; display: inline-block;">
            Accept Invitation
          </a>
        </td>
      </tr>
    </table>
    <p style="font-size: 14px; color: ${DEFAULT_BRANDING.secondaryTextColor}; margin-top: 24px;">If you were not expecting this invitation, you can safely ignore this email.</p>
  `;

  const emailResult = await emailService.send(
    {
      to: payload.email,
      subject: `You've been invited to join ${organization?.name || 'an organization'}`,
      text: text,
      html: renderBrandedLayout(bodyContent),
    },
    log,
  );

  if (!emailResult.success) {
    log.error(
      { error: emailResult.error?.message, email: payload.email },
      'Failed to send invite email via EmailService',
    );
    throw new HTTPException(502, { message: 'Failed to send invite email' });
  }

  log.info(
    { email: payload.email, orgId: organizationId },
    'Invitation created and sent successfully',
  );
  return { success: true, id: inviteId };
}

/**
 * Validates the invite credentials and updates user's organization and orgRole profile fields.
 * @param payload - The invite payload
 * @param payload.email - The invited users email
 * @param payload.code - The entered code
 * @param payload.orgId - The organization Id
 * @param log - App logger that defaults to a blank logger
 * @returns Success status
 */
export async function acceptOrgInvite(
  payload: { email: string; code: string; orgId: string },
  log: AppLogger,
) {
  const invite = await inviteRepository.findValidInvite(payload.email, payload.code, payload.orgId);

  if (!invite) {
    throw new HTTPException(400, { message: 'Invalid code, email, or organization credentials' });
  }

  if (new Date() > invite.expiresAt) {
    throw new HTTPException(400, { message: 'The invitation has expired' });
  }

  const targetUser = await userRepository.findByEmail(payload.email);

  if (!targetUser) {
    throw new HTTPException(404, {
      message: 'User profile not found. Please register an account first.',
    });
  }

  await transactionRepository.run([
    () => userRepository.updateOrgAndRole(targetUser.id, invite.orgId, invite.role),
    () => inviteRepository.updateStatusAndCode(invite.id, 'accepted', null),
  ]);

  log.info(
    { userId: targetUser.id, orgId: invite.orgId, role: invite.role },
    'User successfully accepted invite, joined organization, and was assigned an org role',
  );
  return { success: true };
}

/**
 * Get a list of organization invites for the org associated with the calling user.
 * @param callerUserId - The user Id
 * @param params - Pagination and filter parameters
 * @param params.status - Optional invite status filter
 * @param params.page - The pagination page
 * @param params.limit - The max number of results
 * @param params.offset - The start index
 * @param log - App logger that defaults to a blank logger
 * @returns A list of organization invitations
 */
export async function getOrgInvites(
  callerUserId: string,
  params: {
    status?: OrgInviteStatus;
    page: number;
    limit: number;
    offset: number;
  },
  log: AppLogger,
) {
  const callerUser = await userRepository.findById(callerUserId);

  if (!callerUser) {
    throw new HTTPException(401, { message: 'Unauthorized' });
  }

  if (!callerUser.organizationId) {
    throw new HTTPException(404, { message: 'Caller is not a member of an organization' });
  }

  const userRole = callerUser.orgRole;
  if (userRole !== 'admin') {
    throw new HTTPException(403, {
      message: 'Forbidden: Only organization admins can view invitations',
    });
  }

  log.debug(
    { orgId: callerUser.organizationId, status: params.status },
    'Fetching paginated organization invites',
  );

  const { items, total } = await inviteRepository.getList({
    orgId: callerUser.organizationId,
    status: params.status,
    limit: params.limit,
    offset: params.offset,
  });

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

/**
 * Deletes expired invitations.
 * @returns The number of deleted invites
 */
export async function clearExpiredInvites(): Promise<number> {
  const now = new Date();
  return await inviteRepository.deleteExpired(now);
}
