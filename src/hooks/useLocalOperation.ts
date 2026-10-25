import { useCallback, useEffect, useRef } from 'react';

/** Only the latest local operation may update a mounted screen. No storage. */
export function useLocalOperation(): () => () => boolean {
  const revision = useRef(0);
  useEffect(() => () => { revision.current++; }, []);
  return useCallback(() => {
    const current = ++revision.current;
    return () => current === revision.current;
  }, []);
}
