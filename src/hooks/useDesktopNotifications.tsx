import { useEffect, useRef, useCallback } from 'react';

/** High-priority notification types that trigger a desktop push alert */
const HIGH_PRIORITY_TYPES = new Set(['truck_down', 'new_message']);

interface DesktopNotificationPayload {
  title: string;
  body?: string | null;
  type: string;
  link?: string | null;
}

interface UseDesktopNotificationsOptions {
  /** Called when the user clicks a desktop notification with a link */
  onNavigate?: (link: string) => void;
}

export function useDesktopNotifications({ onNavigate }: UseDesktopNotificationsOptions = {}) {
  const permissionRef = useRef<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  );
  const onNavigateRef = useRef(onNavigate);
  useEffect(() => { onNavigateRef.current = onNavigate; }, [onNavigate]);

  /** Request browser notification permission on mount (silently — only asks once) */
  useEffect(() => {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'default') {
      Notification.requestPermission().then(p => { permissionRef.current = p; });
    } else {
      permissionRef.current = Notification.permission;
    }
  }, []);

  /**
   * Fire a desktop push notification.
   * Only fires for high-priority types and when the tab is not visible.
   */
  const fireNotification = useCallback((payload: DesktopNotificationPayload) => {
    if (typeof Notification === 'undefined') return;
    if (permissionRef.current !== 'granted') return;
    if (!HIGH_PRIORITY_TYPES.has(payload.type)) return;

    // Only fire when the tab is hidden / blurred so we don't interrupt active users
    if (document.visibilityState === 'visible') return;

    const notif = new Notification(payload.title, {
      body: payload.body ?? undefined,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: `supertransport-${payload.type}`,   // deduplicate same-type alerts
      requireInteraction: payload.type === 'truck_down', // truck_down stays until dismissed
    });

    if (payload.link) {
      notif.onclick = () => {
        window.focus();
        onNavigateRef.current?.(payload.link!);
        notif.close();
      };
    }
  }, []);

  return { fireNotification };
}
