import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'HeyClaw <noreply@heyclaw.app>';

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
}

export async function sendEmail(options: SendEmailOptions) {
  const { to, subject, html, text } = options;
  
  const payload: any = {
    from: FROM_EMAIL,
    to: Array.isArray(to) ? to : [to],
    subject,
  };
  if (html) payload.html = html;
  if (text) payload.text = text;
  
  const { data, error } = await resend.emails.send(payload);

  if (error) {
    console.error('❌ Email send failed:', error);
    throw new Error(`Failed to send email: ${error.message}`);
  }

  console.log('✅ Email sent:', data?.id);
  return data;
}

// Common email templates
export async function sendWelcomeEmail(email: string, name?: string) {
  return sendEmail({
    to: email,
    subject: 'Welcome to HeyClaw! 🦅',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #1a1a1a;">Hey ${name || 'there'}! 👋</h1>
        <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6;">
          Welcome to HeyClaw — your personal AI assistant that actually remembers you.
        </p>
        <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6;">
          Start chatting and watch as your assistant learns your preferences, timezone, 
          and the way you like things done.
        </p>
        <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6;">
          Talk soon! 🤠
        </p>
      </div>
    `,
  });
}

export async function sendPasswordResetEmail(email: string, resetToken: string, resetUrl: string) {
  return sendEmail({
    to: email,
    subject: 'Reset your HeyClaw password',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #1a1a1a;">Reset your password</h1>
        <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6;">
          Click the button below to reset your password. This link expires in 1 hour.
        </p>
        <a href="${resetUrl}?token=${resetToken}" 
           style="display: inline-block; background: #000; color: #fff; padding: 12px 24px; 
                  text-decoration: none; border-radius: 8px; margin: 16px 0;">
          Reset Password
        </a>
        <p style="color: #888; font-size: 14px;">
          If you didn't request this, you can safely ignore this email.
        </p>
      </div>
    `,
  });
}

export async function sendVerificationEmail(email: string, code: string) {
  return sendEmail({
    to: email,
    subject: 'Verify your HeyClaw email',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #1a1a1a;">Verify your email</h1>
        <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6;">
          Here's your verification code:
        </p>
        <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; text-align: center; margin: 16px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1a1a1a;">
            ${code}
          </span>
        </div>
        <p style="color: #888; font-size: 14px;">
          This code expires in 10 minutes.
        </p>
      </div>
    `,
  });
}
