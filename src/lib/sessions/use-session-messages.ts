'use client';

import { useEffect, useState, useCallback } from 'react';
import type { ChatMessage } from '@/types/chat';

interface UseSessionMessagesResult {
  messages: ChatMessage[];
  isLoadingHistory: boolean;
  appendMessage: (msg: ChatMessage) => void;
  reset: () => void;
}

export function useSessionMessages(sessionId: string | null | undefined): UseSessionMessagesResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      setMessages([]);
      return;
    }
    const controller = new AbortController();
    setIsLoadingHistory(true);
    fetch(`/api/sessions/${sessionId}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('not found'))))
      .then((data: { messages?: ChatMessage[] }) => setMessages(data.messages ?? []))
      .catch(() => setMessages([]))
      .finally(() => setIsLoadingHistory(false));
    return () => controller.abort();
  }, [sessionId]);

  const appendMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const reset = useCallback(() => setMessages([]), []);

  return { messages, isLoadingHistory, appendMessage, reset };
}
