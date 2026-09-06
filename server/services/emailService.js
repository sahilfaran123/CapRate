import nodemailer from 'nodemailer';
import logger     from '../utils/logger.js';

/**
 * Email Service using Gmail via Nodemailer.
 * Uses an App Password (not your real Gmail password).
 * Configure GMAIL_USER and GMAIL_APP_PASSWORD in .env
 */

function createTransporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    throw new Error('GMAIL_USER and GMAIL_APP_PASSWORD must be set in .env');
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth:    { user, pass },
  });
}

// ─── Send Password Reset Email ────────────────────────────────────────────────
export async function sendPasswordResetEmail(toEmail, resetToken) {
  const appUrl   = process.env.APP_URL || 'http://localhost:5173';
  const resetUrl = `${appUrl}/reset-password?token=${resetToken}&email=${encodeURIComponent(toEmail)}`;
  const from     = process.env.GMAIL_USER;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your FinSync Password</title>
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">

          <!-- Header -->
          <tr>
            <td style="background:#4f46e5;padding:32px;text-align:center;">
              <div style="display:inline-flex;align-items:center;justify-content:center;width:48px;height:48px;background:rgba(255,255,255,0.2);border-radius:12px;margin-bottom:12px;">
                <span style="color:#ffffff;font-size:20px;font-weight:700;">FS</span>
              </div>
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.5px;">FinSync</h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">
              <h2 style="margin:0 0 12px;color:#111827;font-size:20px;font-weight:600;">Reset your password</h2>
              <p style="margin:0 0 24px;color:#6b7280;font-size:15px;line-height:1.6;">
                We received a request to reset the password for your FinSync account associated with <strong style="color:#374151;">${toEmail}</strong>.
              </p>
              <p style="margin:0 0 28px;color:#6b7280;font-size:15px;line-height:1.6;">
                Click the button below to set a new password. This link expires in <strong style="color:#374151;">15 minutes</strong> and can only be used once.
              </p>

              <!-- Button -->
              <table cellpadding="0" cellspacing="0" style="margin:0 0 32px;">
                <tr>
                  <td style="background:#4f46e5;border-radius:10px;">
                    <a href="${resetUrl}"
                       style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;letter-spacing:0.1px;">
                      Reset password →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;color:#9ca3af;font-size:13px;">
                If the button doesn't work, copy and paste this link into your browser:
              </p>
              <p style="margin:0 0 32px;word-break:break-all;">
                <a href="${resetUrl}" style="color:#4f46e5;font-size:13px;">${resetUrl}</a>
              </p>

              <!-- Divider -->
              <hr style="border:none;border-top:1px solid #f3f4f6;margin:0 0 24px;">

              <p style="margin:0;color:#9ca3af;font-size:13px;line-height:1.6;">
                If you didn't request a password reset, you can safely ignore this email. Your password will not be changed.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;padding:24px 40px;border-top:1px solid #f3f4f6;">
              <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
                © ${new Date().getFullYear()} FinSync · Your complete financial picture
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `
Reset your FinSync password

We received a request to reset the password for ${toEmail}.

Click the link below to reset your password (expires in 15 minutes):
${resetUrl}

If you didn't request this, ignore this email — your password won't change.

© ${new Date().getFullYear()} FinSync
`.trim();

  try {
    const transporter = createTransporter();
    const info = await transporter.sendMail({
      from:    `"FinSync" <${from}>`,
      to:      toEmail,
      subject: 'Reset your FinSync password',
      text,
      html,
    });
    logger.info('Password reset email sent', { to: toEmail, messageId: info.messageId });
    return { success: true };
  } catch (err) {
    logger.error('Failed to send password reset email', { to: toEmail, error: err.message });
    throw err;
  }
}

// ─── Send Welcome Email ───────────────────────────────────────────────────────
export async function sendWelcomeEmail(toEmail, name) {
  const appUrl = process.env.APP_URL || 'http://localhost:5173';
  const from   = process.env.GMAIL_USER;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">

          <tr>
            <td style="background:#4f46e5;padding:32px;text-align:center;">
              <span style="color:#ffffff;font-size:24px;font-weight:700;">FinSync</span>
            </td>
          </tr>

          <tr>
            <td style="padding:40px;">
              <h2 style="margin:0 0 16px;color:#111827;font-size:20px;font-weight:600;">
                Welcome to FinSync${name ? `, ${name}` : ''}! 👋
              </h2>
              <p style="margin:0 0 16px;color:#6b7280;font-size:15px;line-height:1.6;">
                Your account is ready. Here's how to get the most out of FinSync:
              </p>

              <table cellpadding="0" cellspacing="0" style="margin:0 0 28px;width:100%;">
                ${[
                  ['🏦', 'Connect your bank accounts', 'Link checking, savings, and credit cards via Plaid'],
                  ['📈', 'Add investment accounts', 'Track your portfolio performance and holdings'],
                  ['🏠', 'Add your properties', 'Track real estate values, cash flow, and equity'],
                  ['🤖', 'Ask the AI Advisor', 'Get personalized insights about your finances'],
                ].map(([icon, title, desc]) => `
                <tr>
                  <td style="padding:12px 0;border-bottom:1px solid #f3f4f6;">
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="font-size:24px;padding-right:16px;vertical-align:top;">${icon}</td>
                        <td>
                          <p style="margin:0 0 4px;color:#111827;font-size:14px;font-weight:600;">${title}</p>
                          <p style="margin:0;color:#6b7280;font-size:13px;">${desc}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>`).join('')}
              </table>

              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#4f46e5;border-radius:10px;">
                    <a href="${appUrl}"
                       style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">
                      Open Dashboard →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="background:#f9fafb;padding:24px 40px;border-top:1px solid #f3f4f6;">
              <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
                © ${new Date().getFullYear()} FinSync · Your complete financial picture
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from:    `"FinSync" <${from}>`,
      to:      toEmail,
      subject: 'Welcome to FinSync 🎉',
      html,
    });
    logger.info('Welcome email sent', { to: toEmail });
    return { success: true };
  } catch (err) {
    // Welcome email failure is non-critical — log but don't throw
    logger.error('Failed to send welcome email', { to: toEmail, error: err.message });
    return { success: false };
  }
}
