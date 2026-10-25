import { lazy, Suspense, useEffect, useState } from 'react';
import { Landing } from './components/Landing.tsx';
import type { WorkspaceView } from './Workspace.tsx';
import './App.css';
import './nextturn.css';
import './motion.css';

const Workspace = lazy(() => import('./Workspace.tsx'));
const routes: Record<string, WorkspaceView> = {
  '#app': 'practice', '#app/practice': 'practice', '#app/testnet': 'testnet',
  '#app/audit': 'audit', '#app/privacy': 'privacy',
};

function App() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    function changed() {
      setHash(window.location.hash);
      if (routes[window.location.hash] || window.location.hash === '') window.scrollTo({ top: 0, behavior: 'instant' });
    }
    window.addEventListener('hashchange', changed);
    return () => window.removeEventListener('hashchange', changed);
  }, []);
  const view = routes[hash];
  // Routes contain only screen names. Never put bids, receipts or viewing keys
  // in query strings, URL fragments, analytics, or browser storage.
  return <div className="app-shell">
    <a href="#main-content" className="skip-link" onClick={(event) => { event.preventDefault(); const main = document.getElementById('main-content'); main?.focus(); main?.scrollIntoView(); }}>Skip to content</a>
    {view ? <Suspense fallback={<div className="main-content" role="status">Opening the app…</div>}><Workspace view={view} /></Suspense> : <Landing />}
  </div>;
}

export default App;
