import nodemailer from 'nodemailer';
import type { Logger } from './logger';

export function createOtpSender(
  options: { email?: string; password?: string; isProduction: boolean },
  logger: Logger,
) {
  if (!options.email || !options.password) {
    if (options.isProduction) throw new Error('EMAIL dan EMAIL_PASSWORD wajib di produksi');
    // Development without SMTP: read the code from the server log
    return async (email: string, otp: string) => {
      logger.warn({ email, otp }, 'SMTP not configured — login OTP printed instead of sent');
    };
  }

  const transport = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: options.email, pass: options.password },
  });

  return async (email: string, otp: string) => {
    await transport.sendMail({
      from: `Catetin <${options.email}>`,
      to: email,
      subject: `Kode masuk Catetin: ${otp}`,
      text: `Kode masuk Catetin kamu: ${otp}\n\nBerlaku 10 menit. Abaikan email ini jika kamu tidak sedang masuk.`,
    });
  };
}
