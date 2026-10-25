import { useEffect, useRef } from 'react';

type Entrance = 'copy' | 'offers' | 'pot';

/**
 * Optional presentation enhancement: content is fully visible without it.
 * No scroll polling, tracking, external library or bid data is involved.
 */
export function useScrollEntrance(kind: Entrance = 'copy') {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = host.current;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!element || reduced.matches || !('IntersectionObserver' in window) || typeof element.animate !== 'function') return;
    const initial = element.getBoundingClientRect();
    // Initially visible content stays still on load, but may replay after it
    // fully leaves the viewport and is reached again.
    let armed = initial.top >= window.innerHeight || initial.bottom <= 0;
    const animations = new Set<Animation>();
    let scrolled = false;
    let inView = false;
    const stop = () => {
      for (const animation of animations) animation.cancel();
      animations.clear();
    };
    const visibility = () => { if (document.hidden) stop(); else play(); };
    const preference = () => { if (reduced.matches) stop(); };
    const animate = (target: Element, frames: Keyframe[], delay = 0) => {
      const small = window.matchMedia('(max-width: 600px)').matches;
      const duration = kind === 'copy' ? (small ? 450 : 600) : (small ? 600 : 800);
      const animation = target.animate(frames, { duration,
        delay: small ? delay / 2 : delay, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'none' });
      animations.add(animation);
      animation.addEventListener('finish', () => { animation.cancel(); animations.delete(animation); }, { once: true });
    };
    const play = () => {
      if (!armed || !scrolled || !inView || document.hidden || reduced.matches || element.contains(document.activeElement)) return;
      armed = false;
      element.dataset.entrancePlayed = 'true';
      element.dataset.entranceState = 'entered';
      const small = window.matchMedia('(max-width: 600px)').matches;
      if (kind === 'offers') {
        element.querySelectorAll('.chart-bar').forEach((bar, i) => animate(bar,
          [{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], i * 80));
      } else if (kind === 'pot') {
        const ring = element.querySelector('.pot-winner-ring');
        if (ring) animate(ring, [{ strokeDasharray: '0 100' }, { strokeDasharray: ring.getAttribute('stroke-dasharray') ?? '0 100' }]);
      } else {
        animate(element, [{ opacity: 0, transform: `translateY(${small ? 12 : 20}px)` }, { opacity: 1, transform: 'translateY(0)' }]);
      }
    };
    const observer = new IntersectionObserver((entries) => {
      inView = entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.12);
      const fullyOutside = entries.some((entry) => entry.boundingClientRect.bottom <= 0 || entry.boundingClientRect.top >= window.innerHeight);
      if (fullyOutside) {
        armed = true;
        stop();
        element.dataset.entranceState = 'ready';
      }
      play();
    }, { threshold: [0, 0.12], rootMargin: '0px' });
    const firstScroll = () => { scrolled = true; window.removeEventListener('scroll', firstScroll); play(); };
    observer.observe(element);
    window.addEventListener('scroll', firstScroll, { passive: true, once: true });
    reduced.addEventListener('change', preference);
    document.addEventListener('visibilitychange', visibility);
    element.addEventListener('focusin', stop);
    return () => { observer.disconnect(); stop(); window.removeEventListener('scroll', firstScroll); reduced.removeEventListener('change', preference);
      document.removeEventListener('visibilitychange', visibility); element.removeEventListener('focusin', stop); };
  }, [kind]);
  return host;
}
