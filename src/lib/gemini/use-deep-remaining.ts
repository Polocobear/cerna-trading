'use client';

import { useEffect, useState } from 'react';

export function useDeepRemaining() {
  const [remaining, setRemaining] = useState<number | null>(null);
  const [limit, setLimit] = useState(4);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/deep-usage')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { remaining: number; limit: number } | null) => {
        if (cancelled || !data) return;
        setRemaining(data.remaining);
        setLimit(data.limit);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return { remaining, limit };
}
