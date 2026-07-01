import crypto from 'node:crypto';

import { HTTPException } from 'hono/http-exception';

import type { OrgRole } from '../db/types.js';
import type { AppLogger } from '../interfaces/logger.interface.js';
import { inviteRepository } from '../repositories/invite.repository.js';
import { transactionRepository } from '../repositories/transaction.repository.js';
import { userRepository } from '../repositories/user.repository.js';

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

  const frontendUrl = process.env.FRONTEND_URL || 'https://villageco-op.com';
  const inviteLink = `${frontendUrl}/verify-invite?org=${organizationId}&code=${inviteCode}&email=${encodeURIComponent(payload.email)}`;

  const emailResult = await emailService.send(
    {
      to: payload.email,
      subject: `You've been invited to join an organization`,
      text: `You have been invited to join the organization as an ${payload.role}.\n\nClick the link below to accept the invitation:\n${inviteLink}\n\nThis invitation link will expire in 7 days.`,
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
    () => inviteRepository.deleteById(invite.id),
  ]);

  log.info(
    { userId: targetUser.id, orgId: invite.orgId, role: invite.role },
    'User successfully accepted invite, joined organization, and was assigned an org role',
  );
  return { success: true };
}

/**
 * Deletes expired invitations.
 * @returns The number of deleted invites
 */
export async function clearExpiredInvites(): Promise<number> {
  const now = new Date();
  return await inviteRepository.deleteExpired(now);
}
