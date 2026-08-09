export interface BrandingOptions {
  logoUrl?: string;
  primaryColor?: string;
  backgroundColor?: string;
  cardBackgroundColor?: string;
  buttonTextColor?: string;
  textColor?: string;
  secondaryTextColor?: string;
}

export const DEFAULT_BRANDING: BrandingOptions = {
  logoUrl: 'https://bzraq0uurafivdo8.public.blob.vercel-storage.com/emails/logo.png',
  primaryColor: '#3a6435',
  backgroundColor: '#1e3820',
  cardBackgroundColor: '#f5edd8',
  buttonTextColor: '#faf7ef',
  textColor: '#1a2018',
  secondaryTextColor: '#6a8060',
};

/**
 * Creates custom branded html for emails.
 * @param contentHtml - The email body html
 * @param options - Brand styling overrides
 * @returns The email body html
 */
export function renderBrandedLayout(contentHtml: string, options: BrandingOptions = {}): string {
  const brand = { ...DEFAULT_BRANDING, ...options };

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; background-color: ${brand.backgroundColor}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: ${brand.textColor};">
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: ${brand.backgroundColor}; padding: 40px 10px;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: ${brand.cardBackgroundColor}; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                <!-- Header / Logo -->
                <tr>
                  <td align="center" style="padding: 30px 20px 20px 20px; border-bottom: 3px solid ${brand.primaryColor};">
                    <img src="${brand.logoUrl}" alt="Village" width="140" style="display: block; width: 140px; max-width: 100%; height: auto; border: 0; border-radius: 10px;" />
                  </td>
                </tr>
                <!-- Main Body -->
                <tr>
                  <td style="padding: 30px 40px; font-size: 16px; line-height: 1.6; color: ${brand.textColor};">
                    ${contentHtml}
                  </td>
                </tr>
                <!-- Footer -->
                <tr>
                  <td align="center" style="padding: 20px; background-color: ${brand.cardBackgroundColor}; font-size: 12px; color: ${brand.secondaryTextColor}; border-top: 1px solid ${brand.primaryColor};">
                    &copy; ${new Date().getFullYear()} Village. All rights reserved.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}
