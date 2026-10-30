import type { Channel, PaymentMethod } from './schemas';

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Tunai',
  qris: 'QRIS',
  debit: 'Debit',
  ewallet: 'E-wallet',
  transfer: 'Transfer',
  other: 'Lainnya',
};

export const CHANNEL_LABELS: Record<Channel, string> = {
  whatsapp: 'WhatsApp',
  email: 'Email',
  app: 'Aplikasi',
  import: 'Impor',
};
