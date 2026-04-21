'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUp, Zap } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface ChatInputProps {
  onSend: (message: string, depth: 'standard' | 'deep') => void;
  disabled?: boolean;
  placeholder?: string;
  depth?: 'standard' | 'deep';
  onDepthChange?: (depth: 'standard' | 'deep') => void;
  deepRemaining?: number | null;
}

const MAX_LINES = 4;
const LINE_HEIGHT_PX = 22;

function detectTouch(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    'ontouchstart' in window ||
    (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0)
  );
}

export function ChatInput({
  onSend,
  disabled,
  placeholder = 'Ask anything about your portfolio...',
  depth: controlledDepth,
  onDepthChange,
  deepRemaining = null,
}: ChatInputProps) {
  const [value, setValue] = useState('');
  const [uncontrolledDepth, setUncontrolledDepth] = useState<'standard' | 'deep'>('standard');
  const [isTouch, setIsTouch] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const depth = controlledDepth ?? uncontrolledDepth;
  const setDepth = useCallback(
    (d: 'standard' | 'deep') => {
      if (onDepthChange) onDepthChange(d);
      else setUncontrolledDepth(d);
    },
    [onDepthChange]
  );

  useEffect(() => {
    setIsTouch(detectTouch());
  }, []);

  const autoSize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const max = MAX_LINES * LINE_HEIGHT_PX + 16;
    el.style.height = Math.min(el.scrollHeight, max) + 'px';
  }, []);

  useEffect(() => {
    autoSize();
  }, [value, autoSize]);

  const submit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed, depth);
    setValue('');
  }, [value, disabled, onSend, depth]);

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== 'Enter') return;
    if (isTouch) {
      if (e.shiftKey) return;
      e.preventDefault();
      submit();
    } else {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        submit();
      }
    }
  }

  const canSend = value.trim().length > 0 && !disabled;

  return (
    <div
      className="mx-auto w-full max-w-[800px] px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <div
        className="rounded-2xl px-3 pt-2 pb-2"
        style={{
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.1)',
          backdropFilter: 'blur(16px)',
        }}
      >
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder={placeholder}
            disabled={disabled}
            className="flex-1 bg-transparent text-[15px] text-cerna-text-primary placeholder:text-[rgba(255,255,255,0.35)] focus:outline-none resize-none py-2 px-1"
            style={{ lineHeight: `${LINE_HEIGHT_PX}px`, maxHeight: MAX_LINES * LINE_HEIGHT_PX + 16 }}
          />
          <button
            onClick={submit}
            disabled={!canSend}
            aria-label="Send"
            className={cn(
              'shrink-0 rounded-full flex items-center justify-center transition-smooth',
              canSend
                ? 'bg-cerna-primary hover:bg-cerna-primary-hover text-white'
                : 'bg-[rgba(255,255,255,0.08)] text-[rgba(255,255,255,0.3)] cursor-not-allowed'
            )}
            style={{ width: 36, height: 36 }}
          >
            <ArrowUp size={18} strokeWidth={2} />
          </button>
        </div>

        <div className="flex items-center gap-2 mt-1 pl-1">
          <div
            className="flex rounded-full p-0.5 text-[12px]"
            style={{ background: 'rgba(255,255,255,0.04)' }}
          >
            <button
              onClick={() => setDepth('standard')}
              className={cn(
                'px-3 py-1 rounded-full transition-smooth',
                depth === 'standard'
                  ? 'bg-[rgba(255,255,255,0.08)] text-cerna-text-primary'
                  : 'text-[rgba(255,255,255,0.5)] hover:text-cerna-text-primary'
              )}
              style={{ transitionDuration: '150ms' }}
            >
              Standard
            </button>
            <button
              onClick={() => setDepth('deep')}
              className={cn(
                'px-3 py-1 rounded-full transition-smooth inline-flex items-center gap-1',
                depth === 'deep'
                  ? 'bg-[rgba(124,91,240,0.2)] text-cerna-primary'
                  : 'text-[rgba(255,255,255,0.5)] hover:text-cerna-text-primary'
              )}
              style={{ transitionDuration: '150ms' }}
            >
              Deep
              <Zap size={10} className="text-amber-400/70" />
            </button>
          </div>
          {depth === 'deep' && deepRemaining !== null && (
            <span className="text-[11px] text-[rgba(255,255,255,0.4)]">
              {deepRemaining} remaining today
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
