import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ILLUSTRATION as email } from '../assets/illustrations/illos-email.ts';
import { ILLUSTRATION as queue } from '../assets/illustrations/illos-queue.ts';
import '../assets/illustrations/illos-email.css';
import '../assets/illustrations/illos-queue.css';
import { Icon } from './Icon.tsx';

/** Reviewed, locally bundled artwork only. Never accepts bid data or keys. */
export function OfferIllustration({ variant = 'email', compact = false, scrollOnly = false }: { variant?: 'email' | 'queue'; compact?: boolean; scrollOnly?: boolean }) {
  const instance = useId().replace(/[^a-z0-9]/gi, '');
  const prefix = `nextturn-${variant}-${instance}-`;
  const source = variant === 'email' ? email : queue.replace('viewBox="0 0 720 460"', 'viewBox="112 20 495 420"');
  const markup = useMemo(() => source
    .replace(/id="([^"]+)"/g, (_, id: string) => `id="${prefix}${id}"`)
    .replace(/url\(#([^)]+)\)/g, (_, id: string) => `url(#${prefix}${id})`)
    .replace(/aria-labelledby="([^"]+)"/g, (_, id: string) => `aria-labelledby="${prefix}${id}"`), [source, prefix]);
  const host = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [visible, setVisible] = useState(() => !document.hidden);
  const [replay, setReplay] = useState(0);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    let scrolled = !scrollOnly || replay > 0;
    let inView = false;
    const play = () => {
      const bounds = host.current?.getBoundingClientRect();
      if (scrolled && inView && bounds && bounds.bottom > 0 && bounds.top < innerHeight && !media.matches && !document.hidden) {
        setActive(true); observer.disconnect();
        window.removeEventListener('scroll', firstScroll);
      }
    };
    const firstScroll = () => { scrolled = true; window.removeEventListener('scroll', firstScroll); play(); };
    const preference = () => { setReduced(media.matches); if (media.matches) setActive(false); };
    const visibility = () => setVisible(!document.hidden);
    media.addEventListener('change', preference);
    document.addEventListener('visibilitychange', visibility);
    const observer = new IntersectionObserver((entries) => {
      inView = entries.some((entry) => entry.isIntersecting);
      play();
    }, { threshold: 0.25 });
    if (host.current) observer.observe(host.current);
    if (!scrolled) window.addEventListener('scroll', firstScroll, { passive: true, once: true });
    return () => { observer.disconnect(); window.removeEventListener('scroll', firstScroll); media.removeEventListener('change', preference); document.removeEventListener('visibilitychange', visibility); };
  }, [replay, scrollOnly]);
  return <figure className={`offer-illustration ${compact ? 'offer-illustration-compact' : ''} illustration-${variant}`}>
    <div ref={host} className={`illustration-stage ${active && visible && !reduced ? 'illustration-playing' : ''}`} aria-hidden="true">
      <div key={replay} className="illustration-art" dangerouslySetInnerHTML={{ __html: markup }} />
    </div>
    {!compact && <figcaption><span>Sealed offers, opened after close.</span><button className="illustration-replay" type="button" disabled={reduced} onClick={() => { setActive(false); setReplay((count) => count + 1); }}><Icon name="circle" size={13} />{reduced ? 'Motion off' : 'Replay'}</button></figcaption>}
  </figure>;
}
