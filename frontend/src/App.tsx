import { lazy, Suspense, useEffect, useState } from 'react';
import LandingPage from './pages/LandingPage';
import { Brand } from './components/Brand';
import { readRoute } from './lib/navigation';

const ApplicationPage = lazy(() => import('./pages/ApplicationPage'));

export function App() {
  const [hash, setHash] = useState(window.location.hash);
  const route = readRoute(hash);
  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  useEffect(() => {
    document.title = route.isApp
      ? 'Exodus — Explore yield on NEAR'
      : 'Exodus — Your yield. Your terms.';
    if (route.isApp || !hash || hash === '#')
      window.scrollTo({ top: 0, behavior: 'instant' });
  }, [hash, route.isApp]);
  return route.isApp ? (
    <Suspense
      fallback={
        <div className="app-loading">
          <Brand />
          <p>Opening your yield workspace…</p>
        </div>
      }
    >
      <ApplicationPage tab={route.tab} marketId={route.marketId} />
    </Suspense>
  ) : (
    <LandingPage />
  );
}
