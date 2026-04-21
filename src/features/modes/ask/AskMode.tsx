'use client';

import { useState } from 'react';
import { Send } from 'lucide-react';
import { ChatStream } from '@/features/chat/ChatStream';

const SUGGESTIONS = [
  'Explain SMSF contribution rules',
  "What's a good P/E ratio for bank stocks?",
  'How do I read a balance sheet?',
];

import type { ChatMessage } from '@/types/chat';

export function AskMode({
  sessionId,
  initialMessages = [],
}: {
  sessionId: string;
  initialMessages?: ChatMessage[];
}) {
  const [input, setInput] = useState('');
  const [activeMessage, setActiveMessage] = useState<string | undefined>(undefined);
  const [trigger, setTrigger] = useState(0);

  function send(message: string) {
    if (!message.trim()) return;
    setActiveMessage(message);
    setInput('');
    setTrigger((t) => t + 1);
  }

  return (
    <div className="max-w-3xl mx-auto flex flex-col min-h-[60vh]">
      {trigger === 0 && initialMessages.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center py-12 text-center animate-fade-in">
          <h2 className="text-xl font-semibold mb-1">Ask anything about investing.</h2>
          <p className="text-cerna-text-secondary mb-8">Portfolio-aware where relevant.</p>
          <div className="flex flex-col sm:flex-row flex-wrap justify-center gap-3 w-full sm:w-auto stagger-children">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="px-4 py-3 text-sm rounded-xl glass border border-cerna-border text-cerna-text-secondary hover:border-cerna-primary hover:text-cerna-primary transition-smooth min-h-[48px]"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {(trigger > 0 || initialMessages.length > 0) && (
        <ChatStream
          mode="ask"
          trigger={trigger}
          sessionId={sessionId}
          message={activeMessage}
          initialMessages={initialMessages}
          followUps={['Tell me more', 'Give an example', 'Relate this to my portfolio']}
          onFollowUp={send}
        />
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="sticky bottom-0 mt-8 flex items-center gap-2 p-2 rounded-xl glass-elevated pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Cerna..."
          className="flex-1 bg-transparent px-3 py-2 text-cerna-text-primary focus:outline-none min-h-[44px]"
        />
        <button
          type="submit"
          disabled={!input.trim()}
          className="px-4 py-2 rounded-lg bg-cerna-primary hover:bg-cerna-primary-hover text-white transition-smooth disabled:opacity-50 min-h-[44px] min-w-[44px] flex items-center justify-center"
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
