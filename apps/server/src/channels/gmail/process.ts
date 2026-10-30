import {
  PAYMENT_METHOD_LABELS,
  formatRupiah,
  isMandiriEmail,
  parseMandiriEmail,
} from '@catetin/shared';
import type { ParsedMail } from 'mailparser';
import type { Logger } from '../../logger';
import type { Services } from '../../services';

export interface EmailContext {
  userId: string;
  services: Services;
  notify: (text: string) => Promise<void>;
  logger: Logger;
}

export type EmailOutcome = 'recorded' | 'duplicate' | 'ignored' | 'unrecognized';

/** Record a Mandiri payment notification; everything else is ignored. */
export async function processEmail(
  mail: ParsedMail,
  ctx: EmailContext,
  fallbackId: string,
): Promise<EmailOutcome> {
  const sender = mail.from?.value[0];
  const email = {
    fromAddress: sender?.address,
    fromName: sender?.name,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  };
  if (!isMandiriEmail(email)) return 'ignored';

  const log = ctx.logger.child({ module: 'gmail', subject: mail.subject });
  const parsed = parseMandiriEmail(email);
  if (!parsed.ok) {
    if (parsed.reason !== 'unrecognized') {
      log.info({ reason: parsed.reason }, 'Mandiri email skipped');
      return 'ignored';
    }
    // A format change at the bank would otherwise lose payments silently
    log.warn('Mandiri email not understood');
    await ctx.notify(
      `⚠️ *Email Mandiri tidak terbaca*\n\nSubjek: ${mail.subject ?? '(kosong)'}\nCatat manual jika ini pembayaran.`,
    );
    return 'unrecognized';
  }

  const created = await ctx.services.transactions.create(
    ctx.userId,
    {
      merchant: parsed.merchant,
      amount: parsed.amount,
      paymentMethod: parsed.paymentMethod,
      occurredAt: mail.date ?? new Date(),
    },
    { channel: 'email', externalId: `email:${mail.messageId ?? fallbackId}` },
  );
  if (!created) {
    log.info('already recorded');
    return 'duplicate';
  }

  log.info({ merchant: created.merchant, amount: created.amount }, 'payment recorded');
  const details = [PAYMENT_METHOD_LABELS[created.paymentMethod], created.category?.name]
    .filter(Boolean)
    .join(' · ');
  await ctx.notify(
    [
      '🏦 *Pembayaran Tercatat*',
      '',
      `📌 ${created.merchant}`,
      `💰 ${formatRupiah(created.amount)}`,
      `💳 ${details}`,
      '',
      '_Salah? Ubah di aplikasi Catetin._',
    ].join('\n'),
  );
  return 'recorded';
}
