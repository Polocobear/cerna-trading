'use client';

import { useEffect, useRef, useState } from 'react';

interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export function MobileDrawer({ open, onClose, children }: MobileDrawerProps) {
  const startX = useRef<number | null>(null);
  const [dragDelta, setDragDelta] = useState(0);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  function onTouchStart(e: React.TouchEvent) {
    startX.current = e.touches[0]?.clientX ?? null;
    setDragDelta(0);
  }
  function onTouchMove(e: React.TouchEvent) {
    if (startX.current === null) return;
    const x = e.touches[0]?.clientX ?? 0;
    const delta = x - startX.current;
    if (delta < 0) setDragDelta(delta);
  }
  function onTouchEnd() {
    if (dragDelta < -60) onClose();
    setDragDelta(0);
    startX.current = null;
  }

  return (
    <div className="md:hidden fixed inset-0 z-50 flex">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div
        className="relative h-full"
        style={{
          transform: `translateX(${dragDelta}px)`,
          transition: dragDelta === 0 ? 'transform 0.2s ease-out' : 'none',
          animation: 'drawer-slide 0.2s ease-out',
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {children}
      </div>
    </div>
  );
}
