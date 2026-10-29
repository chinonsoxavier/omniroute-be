import nodemailer, { type Transporter } from 'nodemailer';
import { env, isProduction } from '../config/env';
import { logger } from './logger';

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!env.SMTP_HOST) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendMail(message: MailMessage): Promise<boolean> {
  const tx = getTransporter();
  if (!tx) {
    if (!isProduction) {
      logger.info({ to: message.to, subject: message.subject, body: message.text }, 'email (dev)');
    } else {
      logger.warn({ to: message.to }, 'SMTP not configured; email not sent');
    }
    return false;
  }
  try {
    await tx.sendMail({ from: env.SMTP_FROM, ...message });
    return true;
  } catch (err) {
    logger.error({ err, to: message.to }, 'failed to send email');
    return false;
  }
}

export function passwordResetEmail(name: string, token: string): MailMessage {
  const link = `${env.APP_URL}/reset-password?token=${token}`;
  return {
    to: '',
    subject: 'Reset your OmniStock password',
    text: `Hi ${name},\n\nUse the link below to reset your OmniStock password. This link expires in 30 minutes.\n\n${link}\n\nIf you did not request this, you can safely ignore this email.`,
    html: `<p>Hi ${name},</p><p>Use the link below to reset your OmniStock password. This link expires in 30 minutes.</p><p><a href="${link}">${link}</a></p><p>If you did not request this, you can safely ignore this email.</p>`,
  };
}
