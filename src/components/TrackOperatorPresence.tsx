import { useTrackOperatorPresence } from '@/hooks/useTrackOperatorPresence';

/**
 * Headless component — mount once globally inside the auth tree.
 * Pings `mark_operator_seen` RPC on every authenticated session and listens
 * for native PWA install events.
 */
export default function TrackOperatorPresence() {
  useTrackOperatorPresence();
  return null;
}