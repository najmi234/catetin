import { CHANNEL_LABELS, PAYMENT_METHOD_LABELS, formatTime } from '@catetin/shared';
import type { Transaction } from './api';

/** Short axis label: 1500000 → "1,5jt", 25000 → "25rb". */
export function compactRupiah(amount: number): string {
  if (amount >= 1_000_000) return `${trim(amount / 1_000_000)}jt`;
  if (amount >= 1_000) return `${trim(amount / 1_000)}rb`;
  return String(amount);
}

function trim(n: number): string {
  return (Math.round(n * 10) / 10).toString().replace('.', ',');
}

/** "14:05 · QRIS · Jajan · WhatsApp" */
export function transactionSubtitle(t: Transaction): string {
  const parts = [formatTime(new Date(t.occurredAt)), PAYMENT_METHOD_LABELS[t.paymentMethod]];
  if (t.pocket) parts.push(t.pocket.name);
  if (t.channel !== 'app') parts.push(CHANNEL_LABELS[t.channel]);
  return parts.join(' · ');
}
