export type IconName = 'seal' | 'arrow' | 'grid' | 'circle' | 'shield' | 'check' | 'clock' | 'download' | 'upload' | 'copy' | 'external' | 'alert' | 'lock' | 'code';

const paths: Record<IconName, string> = {
  seal: 'M12 3 4 7v6c0 5 8 8 8 8s8-3 8-8V7l-8-4Zm-4 9 3 3 5-6',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  grid: 'M3 3h7v7H3V3Zm11 0h7v7h-7V3ZM3 14h7v7H3v-7Zm11 0h7v7h-7v-7Z',
  circle: 'M21 12a9 9 0 1 1-9-9m1 0h8v8M21 3l-9 9',
  shield: 'M12 3 4 7v6c0 5 8 8 8 8s8-3 8-8V7l-8-4Z',
  check: 'm5 12 4 4L19 6',
  clock: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-5v5l3 2',
  download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
  upload: 'M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5',
  copy: 'M8 8h13v13H8V8ZM16 8V3H3v13h5',
  external: 'M14 3h7v7m0-7L10 14M10 3H3v18h18v-7',
  alert: 'm12 3 10 18H2L12 3Zm0 6v5m0 3v.1',
  lock: 'M6 10h12v11H6V10Zm2 0V7a4 4 0 0 1 8 0v3m-4 5v2',
  code: 'm8 6-6 6 6 6m8-12 6 6-6 6m-3-14-2 16',
};

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
