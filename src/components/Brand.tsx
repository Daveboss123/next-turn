export function TurnMark({ size = 25 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <path d="M25 12a10 10 0 0 0-18-3M25 5v7h-7M7 20a10 10 0 0 0 18 3M7 27v-7h7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

export function Brand({ href = '#', app = false }: { href?: string; app?: boolean }) {
  return <a className="brand" href={href} aria-label={app ? 'NextTurn app' : 'NextTurn home'}>
    <span className="brand-mark"><TurnMark /></span>
    <span className="brand-name">NextTurn</span>
  </a>;
}
