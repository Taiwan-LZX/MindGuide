'use client';

import * as React from 'react';

// ─── use-mobile ──────────────────────────────────────────────────────────────
// Standard shadcn/ui hook used by the Sidebar primitive to switch between
// desktop (persistent) and mobile (Sheet-drawer) layouts. SSR-safe: returns
// `false` on the server render and on the first client render, then updates
// after mount.

const MOBILE_BREAKPOINT = 768; // px; matches Tailwind's `md` breakpoint.

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean>(false);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    mql.addEventListener('change', onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isMobile;
}
