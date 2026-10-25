import { useCallback, useState } from 'react';

export type InlineNotificationType = 'success' | 'error' | 'info';

export interface InlineNotificationData {
  type: InlineNotificationType;
  title: string;
  message: string;
}

export function useInlineNotification() {
  const [notification, setNotification] = useState<InlineNotificationData | null>(null);

  const showNotification = useCallback((data: InlineNotificationData) => {
    setNotification(data);
  }, []);

  const clearNotification = useCallback(() => {
    setNotification(null);
  }, []);

  return {
    notification,
    showNotification,
    clearNotification,
  };
}
