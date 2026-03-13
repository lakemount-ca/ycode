'use client';

import { useEffect, useRef } from 'react';

interface CustomCodeInjectorProps {
  html: string;
}

/**
 * Injects custom HTML/script code after React hydration to prevent hydration mismatches.
 *
 * Scripts injected via dangerouslySetInnerHTML execute during HTML parsing (before hydration),
 * which can modify the DOM and cause React error #418. This component defers injection
 * to useEffect (post-hydration), so scripts only run once React owns the DOM.
 */
export default function CustomCodeInjector({ html }: CustomCodeInjectorProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.innerHTML = html;

    // innerHTML doesn't execute <script> tags — re-create them as live elements
    const scripts = container.querySelectorAll('script');
    scripts.forEach((original) => {
      const script = document.createElement('script');
      Array.from(original.attributes).forEach((attr) => {
        script.setAttribute(attr.name, attr.value);
      });
      if (original.textContent) {
        script.textContent = original.textContent;
      }
      original.replaceWith(script);
    });
  }, [html]);

  return <div ref={containerRef} />;
}
