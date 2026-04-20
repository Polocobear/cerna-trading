'use client';

import { useState } from 'react';
import { Send } from 'lucide-react';
import { ChatStream } from '@/features/chat/ChatStream';

const SUGGESTIONS = [
  'Explain SMSF contribution rules',
  "What's a good P/E ratio for ASX banks?",
  'How do I read a balance sheet?',
];

export function AskMode({ sessionId }: { sessionId: string }) {
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
    <div className="max-w-3xl mx-auto">
      {trigger === 0 && (
        <div className="py-12 text-center">
          <h2 className="text-xl font-semibold mb-1">Ask anything about investing.</h2>
          <p className="text-cerna-text-secondary mb-6">Portfolio-aware where relevant.</p>
          <div className="flex flex-wrap justify-center gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="px-4 py-2 text-sm rounded-full bg-cerna-bg-tertiary border border-cerna-border text-cerna-text-secondary hover:border-cerna-border-active hover:text-cerna-text-primary transition"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <ChatStream
        mode="ask"
        trigger={trigger}
        sessionId={sessionId}
        message={activeMessage}
        followUps={['Tell me more', 'Give an example', 'Relate this to my portfolio']}
        onFollowUp={send}
      />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="sticky bottom-4 mt-8 flex items-center gap-2 p-2 rounded-xl bg-cerna-bg-secondary border border-cerna-border"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Cerna..."
          className="flex-1 bg-transparent px-3 py-2 text-cerna-text-primary focus:outline-none"
        />
        <button
          type="submit"
          disabled={!input.trim()}
          className="px-3 py-2 rounded-md bg-cerna-primary hover:bg-cerna-primary-hover text-white transition disabled:opacity-50"
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
