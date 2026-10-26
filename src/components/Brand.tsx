export function TurnMark({ size = 25 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <path d="M25.8 14.2A10 10 0 1 1 21 7.2" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    <path d="m18.6 3.8 5 2.6-3.4 4.6" stroke="#bfe3cc" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="16" cy="16" r="3.1" fill="#bfe3cc" />
  </svg>;
}

export function Brand({ href = '#', app = false }: { href?: string; app?: boolean }) {
  return <a className="brand" href={href} aria-label={app ? 'NextTurn app' : 'NextTurn home'}>
    <span className="brand-mark"><TurnMark /></span>
    <span className="brand-name">NextTurn</span>
  </a>;
}
