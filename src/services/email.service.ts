import { Resend } from 'resend';

import { type AppLogger, noopLogger } from '../interfaces/logger.interface.js';

/**
 * Options for sending an email.
 */
export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  text: string;
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
}

/**
 * Email service instance.
 */
export const emailService = new EmailService();
