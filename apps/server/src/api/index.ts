import {
  categoryInputSchema,
  quickAddSchema,
  transactionCreateSchema,
  transactionListQuerySchema,
  transactionUpdateSchema,
  yearMonthSchema,
} from '@catetin/shared';
import { zValidator } from '@hono/zod-validator';
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import type { Db } from '../db/client';
import { pushTokens } from '../db/schema';
import type { Logger } from '../logger';
import type { Services } from '../services';
import { CategoryNameTakenError } from '../services/categories';
import type { AppEvent } from '../services/events';
import { InvalidCategoryError } from '../services/transactions';

export interface ApiDeps {
  db: Db;
  services: Services;
  logger: Logger;
  /** Resolves the logged-in user from the request; Better Auth in production, a stub in tests. */
  getUserId: (request: Request) => Promise<string | null>;
  /** Mounted at /api/auth/* when present. */
  authHandler?: (request: Request) => Promise<Response>;
  /** Seconds between SSE keep-alive comments. */
  sseHeartbeatSeconds?: number;
}

type Env = { Variables: { userId: string } };

/** zValidator that answers 400 with readable messages instead of the raw zod error. */
function validate<T extends z.ZodType, Target extends 'json' | 'query' | 'param'>(
  target: Target,
  schema: T,
) {
  return zValidator(target, schema, (result, c) => {
    if (!result.success) {
      const issues = result.error.issues.map((i) =>
        i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message,
      );
      return c.json({ error: issues.join('; ') }, 400);
    }
  });
}

const idParam = z.object({ id: z.uuid() });

export function createApp(deps: ApiDeps) {
  const { services, logger } = deps;

  const authed = new Hono<Env>().use(async (c, next) => {
    const userId = await deps.getUserId(c.req.raw);
    if (!userId) return c.json({ error: 'Belum login' }, 401);
    c.set('userId', userId);
    await next();
  });

  const transactionRoutes = new Hono<Env>()
    .get('/', validate('query', transactionListQuerySchema), async (c) => {
      const data = await services.transactions.list(c.get('userId'), c.req.valid('query'));
      return c.json({ data });
    })
    .post('/', validate('json', transactionCreateSchema), async (c) => {
      const data = await services.transactions.create(c.get('userId'), c.req.valid('json'), {
        channel: 'app',
      });
      return c.json({ data: data! }, 201);
    })
    .post('/quick', validate('json', quickAddSchema), async (c) => {
      const { text, occurredAt } = c.req.valid('json');
      const result = await services.transactions.quickAdd(c.get('userId'), text, {
        channel: 'app',
        occurredAt,
      });
      return c.json({ data: result }, result.created.length > 0 ? 201 : 422);
    })
    .get('/:id', validate('param', idParam), async (c) => {
      const data = await services.transactions.get(c.get('userId'), c.req.valid('param').id);
      if (!data) return c.json({ error: 'Transaksi tidak ditemukan' }, 404);
      return c.json({ data });
    })
    .patch(
      '/:id',
      validate('param', idParam),
      validate('json', transactionUpdateSchema),
      async (c) => {
        const data = await services.transactions.update(
          c.get('userId'),
          c.req.valid('param').id,
          c.req.valid('json'),
        );
        if (!data) return c.json({ error: 'Transaksi tidak ditemukan' }, 404);
        return c.json({ data });
      },
    )
    .delete('/:id', validate('param', idParam), async (c) => {
      const deleted = await services.transactions.remove(c.get('userId'), c.req.valid('param').id);
      if (!deleted) return c.json({ error: 'Transaksi tidak ditemukan' }, 404);
      return c.json({ success: true });
    });

  const categoryRoutes = new Hono<Env>()
    .get('/', async (c) => c.json({ data: await services.categories.list(c.get('userId')) }))
    .post('/', validate('json', categoryInputSchema), async (c) => {
      const data = await services.categories.create(c.get('userId'), c.req.valid('json'));
      return c.json({ data }, 201);
    })
    .patch(
      '/:id',
      validate('param', idParam),
      validate(
        'json',
        categoryInputSchema.partial().extend({ sortOrder: z.number().int().min(0).optional() }),
      ),
      async (c) => {
        const data = await services.categories.update(
          c.get('userId'),
          c.req.valid('param').id,
          c.req.valid('json'),
        );
        if (!data) return c.json({ error: 'Kategori tidak ditemukan' }, 404);
        return c.json({ data });
      },
    )
    .delete('/:id', validate('param', idParam), async (c) => {
      const deleted = await services.categories.remove(c.get('userId'), c.req.valid('param').id);
      if (!deleted) return c.json({ error: 'Kategori tidak ditemukan' }, 404);
      return c.json({ success: true });
    });

  const routes = new Hono<Env>()
    .route('/transactions', transactionRoutes)
    .route('/categories', categoryRoutes)
    .get('/summary', validate('query', z.object({ month: yearMonthSchema })), async (c) => {
      const data = await services.summary.month(c.get('userId'), c.req.valid('query').month);
      return c.json({ data });
    })
    .post(
      '/push-tokens',
      validate('json', z.object({ token: z.string().min(1).max(500) })),
      async (c) => {
        const { token } = c.req.valid('json');
        await deps.db
          .insert(pushTokens)
          .values({ userId: c.get('userId'), token })
          .onConflictDoUpdate({
            target: pushTokens.token,
            set: { userId: c.get('userId'), updatedAt: new Date() },
          });
        return c.json({ success: true });
      },
    )
    .get('/events', (c) =>
      streamSSE(c, async (stream) => {
        const queue: AppEvent[] = [];
        let wake: (() => void) | null = null;
        const unsubscribe = services.events.subscribe(c.get('userId'), (event) => {
          queue.push(event);
          wake?.();
        });
        stream.onAbort(unsubscribe);

        await stream.writeSSE({ event: 'ready', data: '{}' });
        while (!stream.aborted) {
          const event = queue.shift();
          if (event) {
            await stream.writeSSE({ event: event.type, data: JSON.stringify(event) });
            continue;
          }
          // Sleep until an event arrives or it is time for a keep-alive
          await new Promise<void>((resolve) => {
            wake = resolve;
            setTimeout(resolve, (deps.sseHeartbeatSeconds ?? 25) * 1000);
          });
          wake = null;
          if (queue.length === 0 && !stream.aborted) await stream.write(': ping\n\n');
        }
        unsubscribe();
      }),
    );

  const base = new Hono().basePath('/api');
  // Registered before the authed routes: Hono runs handlers in registration order,
  // so the login endpoints must not sit behind the login check.
  if (deps.authHandler) {
    const handler = deps.authHandler;
    base.on(['GET', 'POST'], '/auth/*', (c) => handler(c.req.raw));
  }

  const app = base
    .get('/health', async (c) => {
      try {
        await deps.db.execute(sql`select 1`);
        return c.json({ status: 'ok', time: new Date().toISOString() });
      } catch (err) {
        logger.error({ err }, 'health check: database unreachable');
        return c.json({ status: 'error', error: 'database unreachable' }, 503);
      }
    })
    .route('/', authed.route('/', routes));

  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse();
    if (err instanceof InvalidCategoryError) return c.json({ error: err.message }, 400);
    if (err instanceof CategoryNameTakenError) return c.json({ error: err.message }, 409);
    logger.error({ err, path: c.req.path }, 'unhandled API error');
    return c.json({ error: 'Terjadi kesalahan di server' }, 500);
  });
  app.notFound((c) => c.json({ error: 'Endpoint tidak ditemukan' }, 404));

  return app;
}

/** Imported by the mobile app for the typed `hono/client`. */
export type AppType = ReturnType<typeof createApp>;
