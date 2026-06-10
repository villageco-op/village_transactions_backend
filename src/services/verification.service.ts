import { HTTPException } from 'hono/http-exception';

import type { AppLogger } from '../interfaces/logger.interface.js';
import { noopLogger } from '../interfaces/logger.interface.js';
import { verificationRepository } from '../repositories/verification.repository.js';

/**
 * Fetches the latest token for E2E testing validation.
 * @param email - The email
 * @param log - App logger that defaults to a blank logger
 * @returns The token and its expiration
 */
export async function getLatestVerificationToken(email: string, log: AppLogger = noopLogger) {
  const tokenRecord = await verificationRepository.findLatestByEmail(email);

  if (!tokenRecord) {
    log.warn(`No verification token found for email: ${email}`);
    throw new HTTPException(404, { message: 'Verification token not found' });
  }

  if (new Date() > tokenRecord.expires) {
    log.warn(`Verification token for ${email} has expired.`);
    throw new HTTPException(410, { message: 'Verification token expired' });
  }

  return {
    token: tokenRecord.token,
    expires: tokenRecord.expires,
  };
}
