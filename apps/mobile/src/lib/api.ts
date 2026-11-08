import type { AppType } from '@catetin/server/api';
import { hc, type ClientResponse } from 'hono/client';
import { authClient } from './auth-client';
import { API_URL } from './config';

/** Better Auth on React Native keeps the session cookie itself; attach it to every call. */
async function authedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  const cookie = await authClient.getCookie();
  if (cookie) headers.set('Cookie', cookie);
  // "include" would let the native cookie jar interfere with the header set above
  return fetch(input, { ...init, headers, credentials: 'omit' });
}

export const api = hc<AppType>(API_URL, { fetch: authedFetch }).api;

export class ApiError extends Error {
  constructor(
    /** 0 when the server could not be reached at all. */
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

type SuccessStatus = 200 | 201;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- matches any hono response format
type AnyResponse = ClientResponse<any, number, any>;

/** The JSON body of the successful variant(s) of a typed hono response. */
export type OkBody<R> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any response format
  R extends ClientResponse<infer Body, infer Status, any>
    ? Status extends SuccessStatus
      ? Body
      : never
    : never;

/** Await a typed request; throw an ApiError with the server's message unless it succeeded. */
export async function okJson<R extends AnyResponse>(request: Promise<R>): Promise<OkBody<R>> {
  let res: R;
  try {
    res = await request;
  } catch {
    throw new ApiError(0, 'Tidak bisa terhubung ke server. Periksa koneksi internet.');
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(res.status, body?.error ?? `Kesalahan server (${res.status})`);
  }
  return (await res.json()) as OkBody<R>;
}

type Body<F extends (...args: never[]) => Promise<AnyResponse>> = OkBody<Awaited<ReturnType<F>>>;

export type Transaction = Body<typeof api.transactions.$get>['data'][number];
export type MonthSummary = Body<typeof api.summary.$get>['data'];
export type Category = Body<typeof api.categories.$get>['data'][number];
export type QuickAddResult = Body<typeof api.transactions.quick.$post>['data'];
export type Pocket = Body<typeof api.pockets.$get>['data'][number];
export type PocketActivity = Body<(typeof api.pockets)[':id']['activity']['$get']>['data'][number];
