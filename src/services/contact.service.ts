import { HTTPException } from 'hono/http-exception';
import type { Resend } from 'resend';

import type { ContactPayload } from '../schemas/contact.schema.js';

/**
 * Sends an automatic reply to the recipient and forwards the message to contact email.
 * @param client The resend client, injected to simplify testing.
 * @param data The contact form information.
 */
export async function processContactForm(client: Resend, data: ContactPayload) {
  const villageContactEmail = process.env.VILLAGE_CONTACT_EMAIL || 'contact@village.com';
  const fromEmail = process.env.VILLAGE_FROM_EMAIL || 'noreply@village.com';

  const { error: forwardError } = await client.emails.send({
    from: `Village Website <${fromEmail}>`,
    to: villageContactEmail,
    replyTo: data.email,
    subject: `New Contact Form Submission from ${data.name}`,
    text: `You have received a new message from the contact form.\n\nName: ${data.name}\nEmail: ${data.email}\nCompany: ${data.company || 'Not provided'}\n\nMessage:\n${data.message}`,
  });

  if (forwardError) {
    console.error('Failed to forward contact email:', forwardError);
    throw new HTTPException(500, { message: 'Failed to process contact form' });
  }

  const { error: replyError } = await client.emails.send({
    from: `Village Team <${fromEmail}>`,
    to: data.email,
    subject: 'We received your message!',
    text: `Hi ${data.name},\n\nThank you for reaching out! We have received your message and will get back to you as soon as possible.\n\nBest regards,\nThe Village Team`,
  });

  if (replyError) {
    console.error('Failed to send auto-reply email:', replyError);
  }
}
