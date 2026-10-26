import { useEffect, useState } from 'react';
import { Icon } from './components/Icon.tsx';
import { Brand } from './components/Brand.tsx';
import { Practice } from './components/Practice.tsx';
import { Testnet } from './components/Testnet.tsx';
import { Audit } from './components/Audit.tsx';
import { Privacy } from './components/Privacy.tsx';
import { createPracticeRound } from './lib/practice.ts';
import type { PracticeRound } from './lib/practice.ts';

export type WorkspaceView = 'practice' | 'testnet' | 'audit' | 'privacy';
const navigation: { id: WorkspaceView; name: string; short: string }[] = [
  { id: 'practice', name: 'Practice round', short: 'Practice' }, { id: 'testnet', name: 'Use a wallet', short: 'Wallet' },
  { id: 'audit', name: 'Check a result', short: 'Results' }, { id: 'privacy', name: 'Privacy', short: 'Privacy' },
];

export default function Workspace({ view }: { view: WorkspaceView }) {
  const [round, setRound] = useState<PracticeRound | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [savedRoundHash, setSavedRoundHash] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    createPracticeRound({ version: 2 }).then((value) => { if (active) setRound(value); }).catch(() => { if (active) setLoadError(true); });
    return () => { active = false; };
  }, []);
  function onPractice() { window.location.hash = 'app/practice'; }
  return <>
    <header className="site-header workspace-site-header"><div className="header-inner workspace-header">
      <Brand href="#app" app />
      <nav className="main-nav" aria-label="App navigation">{navigation.map((item) => <a className={`nav-item ${view === item.id ? 'nav-active' : ''}`} key={item.id} aria-current={view === item.id ? 'page' : undefined} href={`#app/${item.id}`}><span className="nav-label-full">{item.name}</span><span className="nav-label-short">{item.short}</span></a>)}</nav>
      <a className="back-to-site" href="#">Back to site<Icon name="external" size={13} /></a>
    </div></header>
    <main id="main-content" className="main-content workspace-content" tabIndex={-1}>
      {view === 'practice' && (round ? <Practice round={round} onChange={setRound} receiptSaved={savedRoundHash === round.manifest.rulesHash} onReceiptSaved={() => setSavedRoundHash(round.manifest.rulesHash)} /> : <div className="card" role="status">{loadError ? 'Open this app on localhost or HTTPS in a modern browser to use the practice round.' : 'Preparing your practice round…'}</div>)}
      {view === 'testnet' && <Testnet onPractice={onPractice} />}
      {view === 'audit' && <Audit onPractice={onPractice} />}
      {view === 'privacy' && <Privacy />}
      <footer className="page-footer workspace-footer"><span>NextTurn</span><p>Practice and testnet only. No money is managed here.</p><a className="text-button footer-version" href="#app/privacy">Privacy notes<Icon name="arrow" size={13} /></a></footer>
    </main>
  </>;
}
