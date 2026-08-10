import { HTTPException } from 'hono/http-exception';

import { type AppLogger, noopLogger } from '../interfaces/logger.interface.js';
import type { ContactPayload } from '../schemas/contact.schema.js';

import { renderBrandedLayout } from './email/template.js';
import { emailService } from './email.service.js';

/**
 * Sends an automatic reply to the recipient and forwards the message to contact email.
 * @param data The contact form information.
 * @param log - App logger that defaults to a blank logger
 */
export async function processContactForm(data: ContactPayload, log: AppLogger = noopLogger) {
  const villageContactEmail = process.env.VILLAGE_CONTACT_EMAIL || 'contact@village.com';

  const forwardResult = await emailService.send(
    {
      fromName: 'Village Website',
      to: villageContactEmail,
      replyTo: data.email,
      subject: `New Contact Form Submission from ${data.name}`,
      text: `You have received a new message from the contact form.\n\nName: ${data.name}\nEmail: ${data.email}\nCompany: ${data.company || 'Not provided'}\n\nMessage:\n${data.message}`,
    },
    log,
  );

  if (!forwardResult.success) {
    throw new HTTPException(500, { message: 'Failed to process contact form' });
  }

  const text = `Hi ${data.name},\n\nThank you for reaching out! We have received your message and will get back to you as soon as possible.\n\nBest regards,\nThe Village Team`;
  const formattedText = text.replace(/\n/g, '<br>');

  const bodyContent = `
    <h2 style="margin-top: 0;">We received your message!</h2>
    <p>${formattedText}</p>
  `;

  const replyResult = await emailService.send(
    {
      to: data.email,
      subject: 'We received your message!',
      text: text,
      html: renderBrandedLayout(bodyContent),
    },
    log,
  );

  if (replyResult.success) {
    log.info('Auto-reply sent successfully');
  }
}
