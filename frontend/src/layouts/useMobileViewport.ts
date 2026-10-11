import { useSyncExternalStore } from 'react';

const subscribe = (callback: () => void) => {
  const media = window.matchMedia?.('(max-width: 767px)');
  if (media?.addEventListener) {
    media.addEventListener('change', callback);
    return () => media.removeEventListener('change', callback);
  }
  window.addEventListener('resize', callback);
  return () => window.removeEventListener('resize', callback);
};

export const useMobileViewport = () =>
  useSyncExternalStore(subscribe, () => window.matchMedia?.('(max-width: 767px)').matches ?? window.innerWidth <= 767, () => false);
