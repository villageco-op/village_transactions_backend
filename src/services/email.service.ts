import { Resend } from 'resend';

import { type AppLogger, noopLogger } from '../interfaces/logger.interface.js';

/**
 * Options for sending an email.
 */
export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  fromName?: string;
}

/**
 * Email service class for sending emails.
 */
export class EmailService {
  private client: Resend | null = null;
  private fromEmail: string;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    this.fromEmail = process.env.VILLAGE_FROM_EMAIL || 'noreply@village.com';

    if (apiKey) {
      this.client = new Resend(apiKey);
    }
  }

  /**
   * Core helper to send emails securely with unified logging and error management.
   * @param options - The email options
   * @param options.to - The email destination
   * @param options.subject - The email subject
   * @param options.text - The email content
   * @param options.replyTo - Email reply destination
   * @param options.fromName - Override the default email from name
   * @param log - App logger that defaults to a blank logger
   * @returns Promise contains success and error
   */
  async send(
    options: SendEmailOptions,
    log: AppLogger = noopLogger,
  ): Promise<{ success: boolean; error?: Error }> {
    if (!this.client) {
      log.warn('Resend API key is missing. Skipping email dispatch.');
      return { success: false, error: new Error('Email service not initialized') };
    }

    const fromName = options.fromName || 'Village Team';

    try {
      const { error } = await this.client.emails.send({
        from: `${fromName} <${this.fromEmail}>`,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
        replyTo: options.replyTo,
      });

      if (error) {
        log.error({ error: error.message }, `Resend failed to send email: ${options.subject}`);
        return { success: false, error: new Error(error.message) };
      }

      return { success: true };
    } catch (err) {
      const errorInstance = err instanceof Error ? err : new Error(String(err));
      log.error(
        { error: errorInstance.message },
        `Unexpected error sending email: ${options.subject}`,
      );
      return { success: false, error: errorInstance };
    }
  }

  /**
   * Sends a dispute notification email to the village contact team.
   * @param orderId The ID of the order being disputed
   * @param userId The ID of the user filing the dispute
   * @param userEmail The email address of the user filing the dispute
   * @param log App logger instance
   * @returns Promise contains success and error
   */
  async sendDisputeNotification(
    orderId: string,
    userId: string,
    userEmail: string,
    log: AppLogger = noopLogger,
  ): Promise<{ success: boolean; error?: Error }> {
    const contactEmail = process.env.VILLAGE_CONTACT_EMAIL || 'support@village.com';
    const subject = `New Dispute Filed: Order #${orderId}`;

    const text =
      `A new dispute has been filed.\n\n` +
      `Order ID: ${orderId}\n` +
      `User ID: ${userId}\n` +
      `User Email: ${userEmail}\n\n`;

    const html = `
      <div style="font-family: Arial, sans-serif; color: #333; padding: 20px;">
        <h2 style="color: #d9534f;">New Dispute Filed</h2>
        <p>A new dispute has been submitted by a user.</p>
        <ul style="list-style-type: none; padding: 0;">
          <li><strong>Order ID:</strong> ${orderId}</li>
          <li><strong>User ID:</strong> ${userId}</li>
          <li><strong>User Email:</strong> <a href="mailto:${userEmail}">${userEmail}</a></li>
        </ul>
      </div>
    `;

    return this.send(
      {
        to: contactEmail,
        subject,
        text,
        html,
        replyTo: userEmail,
      },
      log,
    );
  }
}

/**
 * Email service instance.
 */
export const emailService = new EmailService();
