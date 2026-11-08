import { z } from 'zod';

export const PAYMENT_METHODS = ['cash', 'qris', 'debit', 'ewallet', 'transfer', 'other'] as const;
export const paymentMethodSchema = z.enum(PAYMENT_METHODS);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export const CHANNELS = ['whatsapp', 'email', 'app', 'import'] as const;
export const channelSchema = z.enum(CHANNELS);
export type Channel = z.infer<typeof channelSchema>;

export const yearMonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Format bulan harus YYYY-MM');

export const amountSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

const merchantSchema = z.string().trim().min(1).max(200);
const noteSchema = z.string().trim().max(500).nullable();
const occurredAtSchema = z.iso.datetime({ offset: true });

export const transactionCreateSchema = z.object({
  merchant: merchantSchema,
  amount: amountSchema,
  categoryId: z.uuid().nullable().optional(),
  /** undefined = the category's pocket, null = no pocket */
  pocketId: z.uuid().nullable().optional(),
  paymentMethod: paymentMethodSchema.default('cash'),
  note: noteSchema.optional(),
  occurredAt: occurredAtSchema.optional(),
});
export type TransactionCreateInput = z.input<typeof transactionCreateSchema>;

// No defaults here: an omitted field must stay untouched on update.
export const transactionUpdateSchema = z
  .object({
    merchant: merchantSchema,
    amount: amountSchema,
    categoryId: z.uuid().nullable(),
    pocketId: z.uuid().nullable(),
    paymentMethod: paymentMethodSchema,
    note: noteSchema,
    occurredAt: occurredAtSchema,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Tidak ada field yang diubah');
export type TransactionUpdateInput = z.input<typeof transactionUpdateSchema>;

/** Free-text entry, same format as WhatsApp: one expense per line. */
export const quickAddSchema = z.object({
  text: z.string().trim().min(1).max(2000),
  occurredAt: occurredAtSchema.optional(),
});
export type QuickAddInput = z.input<typeof quickAddSchema>;

export const transactionListQuerySchema = z.object({
  month: yearMonthSchema,
  q: z.string().trim().max(100).optional(),
});
export type TransactionListQuery = z.infer<typeof transactionListQuerySchema>;

const colorSchema = z.string().regex(/^#[0-9a-f]{6}$/i, 'Warna harus berformat #RRGGBB');

export const categoryInputSchema = z.object({
  name: z.string().trim().min(1).max(50),
  color: colorSchema.optional(),
  icon: z.string().trim().max(50).optional(),
  /** Pocket that expenses in this category are taken from. */
  pocketId: z.uuid().nullable().optional(),
});
export type CategoryInput = z.input<typeof categoryInputSchema>;

export const pocketInputSchema = z.object({
  name: z.string().trim().min(1).max(50),
  color: colorSchema.optional(),
  icon: z.string().trim().max(50).optional(),
});
export type PocketInput = z.input<typeof pocketInputSchema>;

export const pocketTopUpSchema = z.object({
  amount: amountSchema,
  note: noteSchema.optional(),
  occurredAt: occurredAtSchema.optional(),
});
export type PocketTopUpInput = z.input<typeof pocketTopUpSchema>;

export const pocketTransferSchema = z
  .object({
    fromPocketId: z.uuid(),
    toPocketId: z.uuid(),
    amount: amountSchema,
    note: noteSchema.optional(),
  })
  .refine((t) => t.fromPocketId !== t.toPocketId, {
    message: 'Kantong asal dan tujuan harus berbeda',
    path: ['toPocketId'],
  });
export type PocketTransferInput = z.input<typeof pocketTransferSchema>;
