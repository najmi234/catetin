import { EventEmitter } from 'node:events';

export type AppEvent =
  | { type: 'transaction.created'; id: string }
  | { type: 'transaction.updated'; id: string }
  | { type: 'transaction.deleted'; id: string }
  | { type: 'categories.changed' };

type Listener = (event: AppEvent) => void;

/** In-process pub/sub, fanned out to the mobile app over SSE. */
export class EventBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    // One listener per open SSE connection
    this.emitter.setMaxListeners(100);
  }

  publish(userId: string, event: AppEvent): void {
    this.emitter.emit(userId, event);
  }

  subscribe(userId: string, listener: Listener): () => void {
    this.emitter.on(userId, listener);
    return () => this.emitter.off(userId, listener);
  }
}
