import { focusManager, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import EventSource from 'react-native-sse';
import { authClient } from './auth-client';
import { API_URL } from './config';
import { invalidateAfterEvent } from './queries';

const EVENT_TYPES = [
  'transaction.created',
  'transaction.updated',
  'transaction.deleted',
  'categories.changed',
  'pockets.changed',
] as const;
type ServerEvent = (typeof EVENT_TYPES)[number] | 'ready';

/**
 * Keep the screens in sync with entries arriving from WhatsApp, email or another device:
 * listen to the server's SSE stream while the app is in the foreground, and refetch
 * everything when it comes back from the background (events may have been missed).
 */
export function useLiveUpdates() {
  const client = useQueryClient();

  useEffect(() => {
    let source: EventSource<ServerEvent> | null = null;
    let disposed = false;

    async function open() {
      if (source) return;
      const cookie = await authClient.getCookie();
      if (disposed || source) return;
      source = new EventSource<ServerEvent>(`${API_URL}/api/events`, {
        headers: cookie ? { Cookie: cookie } : {},
        // Reconnect delay after the stream drops
        pollingInterval: 5_000,
      });
      for (const type of EVENT_TYPES) {
        source.addEventListener(type, () => invalidateAfterEvent(client, type));
      }
    }

    function close() {
      source?.removeAllEventListeners();
      source?.close();
      source = null;
    }

    void open();
    const subscription = AppState.addEventListener('change', (state) => {
      const active = state === 'active';
      focusManager.setFocused(active);
      if (active) {
        void open();
        void client.invalidateQueries();
      } else {
        close();
      }
    });

    return () => {
      disposed = true;
      subscription.remove();
      close();
    };
  }, [client]);
}
