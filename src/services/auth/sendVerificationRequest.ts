import type { NodemailerConfig } from '@auth/core/providers/nodemailer';
import { createTransport } from 'nodemailer';

import { DEFAULT_BRANDING, renderBrandedLayout } from '../email/template.js';

interface RequestParams {
  identifier: string;
  url: string;
  provider: NodemailerConfig;
}

/**
 * Sends a nodemailer verification request email with custom brand html.
 * @param params - Request parameters
 * @param params.identifier - The destination
 * @param params.url - The host URL
 * @param params.provider - The auth provider
 */
export default async function sendNodemailerVerificationRequest({
  identifier,
  url,
  provider,
}: RequestParams) {
  const { host } = new URL(url);

  const magicLinkHtml = `
    <h2 style="margin-top: 0; color: ${DEFAULT_BRANDING.textColor};">Sign in to Village</h2>
    <p style="margin-bottom: 24px;">Click the button below to log in to <strong>${host}</strong>. This link will expire shortly.</p>
    <table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin: 28px 0;">
        <tr>
        <td align="center" style="border-radius: 6px; background-color: ${DEFAULT_BRANDING.primaryColor};">
            <a href="${url}" target="_blank" style="font-size: 16px; font-weight: bold; color: ${DEFAULT_BRANDING.buttonTextColor}; text-decoration: none; border-radius: 6px; padding: 12px 24px; display: inline-block;">
            Sign In
            </a>
        </td>
        </tr>
    </table>
    <p style="font-size: 14px; color: ${DEFAULT_BRANDING.secondaryTextColor}; margin-top: 24px;">If you did not request this email, you can safely ignore it.</p>
    `;

  const transport = createTransport(provider.server);

  const result = await transport.sendMail({
    to: identifier,
    from: provider.from,
    subject: `Sign in to ${host}`,
    text: `Sign in to ${host}\n${url}\n\n`,
    html: renderBrandedLayout(magicLinkHtml),
  });

  const failed = result.rejected.concat(result.pending).filter(Boolean);
  if (failed.length > 0) {
    throw new Error(`Email(s) (${failed.join(', ')}) could not be sent`);
  }
}
