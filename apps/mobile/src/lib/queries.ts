import type {
  CategoryInput,
  PocketInput,
  PocketTopUpInput,
  PocketTransferInput,
  TransactionCreateInput,
  TransactionUpdateInput,
} from '@catetin/shared';
import {
  QueryCache,
  QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { ApiError, api, okJson } from './api';
import { authClient } from './auth-client';

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      // Session expired or revoked on the server: drop it locally so the login screen shows
      if (error instanceof ApiError && error.status === 401) void authClient.signOut();
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failures, error) =>
        failures < 2 && !(error instanceof ApiError && error.status >= 400 && error.status < 500),
    },
  },
});

export const keys = {
  transactions: (month: string, q = '') => ['transactions', month, q] as const,
  transaction: (id: string) => ['transaction', id] as const,
  summary: (month: string) => ['summary', month] as const,
  categories: ['categories'] as const,
  pockets: ['pockets'] as const,
  pocket: (id: string) => ['pocket', id] as const,
  pocketActivity: (id: string, month: string) => ['pocket-activity', id, month] as const,
};

/** Pocket balances and histories. */
function invalidatePockets(client: QueryClient) {
  return Promise.all([
    client.invalidateQueries({ queryKey: ['pockets'] }),
    client.invalidateQueries({ queryKey: ['pocket'] }),
    client.invalidateQueries({ queryKey: ['pocket-activity'] }),
  ]);
}

/** Everything derived from transactions — including pocket balances. */
function invalidateTransactions(client: QueryClient) {
  return Promise.all([
    client.invalidateQueries({ queryKey: ['transactions'] }),
    client.invalidateQueries({ queryKey: ['transaction'] }),
    client.invalidateQueries({ queryKey: ['summary'] }),
    invalidatePockets(client),
  ]);
}

export function invalidateAfterEvent(client: QueryClient, type: string) {
  if (type === 'pockets.changed') {
    // Renamed or deleted pockets also show up on transactions and categories
    void invalidatePockets(client);
    void client.invalidateQueries({ queryKey: keys.categories });
    void client.invalidateQueries({ queryKey: ['transactions'] });
    void client.invalidateQueries({ queryKey: ['transaction'] });
    return;
  }
  if (type === 'categories.changed') {
    void client.invalidateQueries({ queryKey: keys.categories });
  }
  void invalidateTransactions(client);
}

// ── Queries ─────────────────────────────────────────────

export function useTransactions(month: string, q = '') {
  return useQuery({
    queryKey: keys.transactions(month, q),
    queryFn: async () =>
      (await okJson(api.transactions.$get({ query: { month, ...(q && { q }) } }))).data,
  });
}

export function useTransaction(id: string) {
  return useQuery({
    queryKey: keys.transaction(id),
    queryFn: async () => (await okJson(api.transactions[':id'].$get({ param: { id } }))).data,
  });
}

export function useSummary(month: string) {
  return useQuery({
    queryKey: keys.summary(month),
    queryFn: async () => (await okJson(api.summary.$get({ query: { month } }))).data,
  });
}

export function useCategories() {
  return useQuery({
    queryKey: keys.categories,
    queryFn: async () => (await okJson(api.categories.$get())).data,
    staleTime: 5 * 60_000,
  });
}

export function usePockets() {
  return useQuery({
    queryKey: keys.pockets,
    queryFn: async () => (await okJson(api.pockets.$get())).data,
  });
}

export function usePocket(id: string) {
  return useQuery({
    queryKey: keys.pocket(id),
    queryFn: async () => (await okJson(api.pockets[':id'].$get({ param: { id } }))).data,
  });
}

export function usePocketActivity(id: string, month: string) {
  return useQuery({
    queryKey: keys.pocketActivity(id, month),
    queryFn: async () =>
      (await okJson(api.pockets[':id'].activity.$get({ param: { id }, query: { month } }))).data,
  });
}

// ── Mutations ───────────────────────────────────────────

export function useCreateTransaction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: TransactionCreateInput) =>
      (await okJson(api.transactions.$post({ json: input }))).data,
    onSuccess: () => invalidateTransactions(client),
  });
}

export function useQuickAdd() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (text: string) =>
      (await okJson(api.transactions.quick.$post({ json: { text } }))).data,
    onSuccess: (result) => {
      if (result.created.length > 0) return invalidateTransactions(client);
    },
  });
}

export function useUpdateTransaction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, changes }: { id: string; changes: TransactionUpdateInput }) =>
      (await okJson(api.transactions[':id'].$patch({ param: { id }, json: changes }))).data,
    onSuccess: () => invalidateTransactions(client),
  });
}

export function useDeleteTransaction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => okJson(api.transactions[':id'].$delete({ param: { id } })),
    onSuccess: () => invalidateTransactions(client),
  });
}

function useCategoryMutation<T>(fn: (input: T) => Promise<unknown>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: keys.categories }),
        invalidateTransactions(client),
      ]),
  });
}

export function useCreateCategory() {
  return useCategoryMutation((input: CategoryInput) =>
    okJson(api.categories.$post({ json: input })),
  );
}

export function useUpdateCategory() {
  return useCategoryMutation(({ id, changes }: { id: string; changes: Partial<CategoryInput> }) =>
    okJson(api.categories[':id'].$patch({ param: { id }, json: changes })),
  );
}

export function useDeleteCategory() {
  return useCategoryMutation((id: string) =>
    okJson(api.categories[':id'].$delete({ param: { id } })),
  );
}

function usePocketMutation<T>(fn: (input: T) => Promise<unknown>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => invalidatePockets(client),
  });
}

export function useCreatePocket() {
  return usePocketMutation((input: PocketInput) => okJson(api.pockets.$post({ json: input })));
}

export function useUpdatePocket() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, changes }: { id: string; changes: Partial<PocketInput> }) =>
      okJson(api.pockets[':id'].$patch({ param: { id }, json: changes })),
    // Names and colours also appear on transactions
    onSuccess: () => invalidateTransactions(client),
  });
}

/** Deleting a pocket also changes transactions and categories that pointed at it. */
export function useDeletePocket() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => okJson(api.pockets[':id'].$delete({ param: { id } })),
    onSuccess: () =>
      Promise.all([
        invalidateTransactions(client),
        client.invalidateQueries({ queryKey: keys.categories }),
      ]),
  });
}

export function useTopUpPocket() {
  return usePocketMutation(({ id, input }: { id: string; input: PocketTopUpInput }) =>
    okJson(api.pockets[':id'].topup.$post({ param: { id }, json: input })),
  );
}

export function useTransferPockets() {
  return usePocketMutation((input: PocketTransferInput) =>
    okJson(api.pockets.transfer.$post({ json: input })),
  );
}

export function useRemovePocketEntry() {
  return usePocketMutation((id: string) =>
    okJson(api.pockets.entries[':id'].$delete({ param: { id } })),
  );
}
