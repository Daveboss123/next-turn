import type { ReactNode } from 'react';
import { useScrollEntrance } from '../hooks/useScrollEntrance.ts';

export function ScrollEntrance({ children, className }: { children: ReactNode; className?: string }) {
  const host = useScrollEntrance();
  return <div ref={host} className={className} data-scroll-entrance="copy">{children}</div>;
}
