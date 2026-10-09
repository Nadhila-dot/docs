'use client';

import { usePathname } from 'next/navigation';
import { useLayoutEffect, useRef } from 'react';

export function PageMotion() {
  const pathname = usePathname();
  const previousPath = useRef(pathname);

  useLayoutEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const content = document.querySelector<HTMLElement>(
      '#nd-page, main.landing, main.blog-index, article.blog-article',
    );
    if (!content?.animate) return;

    const animation = content.animate(
      [
        { opacity: 0.82, transform: 'translateY(4px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { duration: 180, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
    );
    return () => animation.cancel();
  }, [pathname]);

  return null;
}
