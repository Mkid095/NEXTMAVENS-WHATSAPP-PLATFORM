import { useEffect, useRef } from 'react';

interface StreamEvent {
  event: string;
  data: any;
}

export function useInstanceStream(
  instanceId: string | undefined,
  onEvent: (event: StreamEvent) => void
) {
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!instanceId) return;

    const token = localStorage.getItem('accessToken');
    if (!token) return;

    const API_BASE = import.meta.env.VITE_API_URL || 'https://whatsappapi.nextmavens.cloud/api/v1/whatsapp';
    const url = `${API_BASE}/instances/${instanceId}/stream?token=${token}`;
    
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onEvent({ event: 'message', data });
      } catch (e) {
        console.error('Failed to parse SSE message:', e);
      }
    };

    // Evolution API often sends specific event names
    const eventTypes = ['connection_update', 'qr_code_updated', 'message_received'];
    eventTypes.forEach(type => {
      eventSource.addEventListener(type, (e: any) => {
        try {
          const data = JSON.parse(e.data);
          onEvent({ event: type, data });
        } catch (err) {
          console.error(`Failed to parse SSE ${type} event:`, err);
        }
      });
    });

    eventSource.onerror = (error) => {
      console.error('SSE error:', error);
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [instanceId, onEvent]);
}
