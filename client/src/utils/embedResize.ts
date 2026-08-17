import { useEffect } from 'react';

const EMBED_RESIZE_MESSAGE = 'vigor.workbench.embed.resize.v1';

/** Notify the same-origin workbench about document height only when embedded. */
export function useEmbedResize() {
  useEffect(() => {
    if (window.parent === window) return;

    let frame = 0;
    const reportHeight = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const height = Math.max(
          document.documentElement.scrollHeight,
          document.body?.scrollHeight ?? 0,
          document.documentElement.clientHeight,
        );
        window.parent.postMessage({ type: EMBED_RESIZE_MESSAGE, height }, window.location.origin);
      });
    };

    const observer = new ResizeObserver(reportHeight);
    observer.observe(document.documentElement);
    window.addEventListener('resize', reportHeight);
    reportHeight();

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', reportHeight);
    };
  }, []);
}
