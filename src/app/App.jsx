// Top-level: decides which screen to show from the session + route.

import { useEffect } from 'preact/hooks';
import { session, kid, today } from '../data/store.js';
import { reconcileDay } from '../data/actions.js';
import { route, navigate } from './router.js';
import { Celebrations } from '../ui/widgets.jsx';
import { Icon } from '../ui/Icon.jsx';
import { setSoundEnabled } from '../ui/sfx.js';
import { Welcome } from '../screens/Welcome.jsx';
import { Onboarding } from '../screens/Onboarding.jsx';
import { Home } from '../screens/Home.jsx';
import { Path } from '../screens/Path.jsx';
import { Review } from '../screens/Review.jsx';
import { Progress } from '../screens/Progress.jsx';
import { Trophies } from '../screens/Trophies.jsx';
import { Settings } from '../screens/Settings.jsx';
import { GrownUp, GrownUpHome } from '../screens/GrownUp.jsx';
import { LessonScreen } from '../lesson/LessonScreen.jsx';
import { FreeTalk } from '../tutor/FreeTalk.jsx';

const TABS = [
  { path: '/', icon: 'home', label: 'Home' },
  { path: '/path', icon: 'path', label: 'Learn' },
  { path: '/review', icon: 'review', label: 'Review' },
  { path: '/progress', icon: 'chart', label: 'Progress' },
  { path: '/trophies', icon: 'trophy', label: 'Trophies' },
];

function Shell({ children }) {
  const r = route.value;
  return (
    <div class="shell">
      <nav class="tabbar" aria-label="Main">
        {TABS.map((t) => (
          <a href={`#${t.path}`} class={`tab${r === t.path ? ' on' : ''}`} aria-current={r === t.path ? 'page' : undefined}>
            <Icon name={t.icon} />{t.label}
          </a>
        ))}
      </nav>
      <main class="shell-main">{children}</main>
    </div>
  );
}

function Loading() {
  return <div class="welcome"><div class="brand">¡Dale!</div></div>;
}

export function App() {
  const s = session.value;
  const k = kid.value;
  const r = route.value;
  const t = today.value;

  // New day or app opened: apply freezes / welcome back / league.
  useEffect(() => { if (k && k.profile.onboarded) reconcileDay(); }, [t, !!k, k?.profile.onboarded]);
  useEffect(() => { setSoundEnabled(k?.settings.sound !== false); }, [k?.settings.sound]);

  if (s.status === 'loading') return <Loading />;
  if (s.status === 'welcome') return <Welcome />;
  if (s.status === 'grownup') return <><GrownUpHome /><Celebrations /></>;
  if (!k) return <Loading />;
  if (!k.profile.onboarded) return <Onboarding />;

  let screen;
  const lessonMatch = r.match(/^\/lesson\/([\w-]+)$/);
  if (lessonMatch) return <><LessonScreen key={lessonMatch[1]} lessonId={lessonMatch[1]} /><Celebrations /></>;
  if (r === '/smart-review') return <><LessonScreen key="smart" smart /><Celebrations /></>;
  if (r === '/free-talk') return <><FreeTalk /><Celebrations /></>;
  if (r === '/grown-up') return <><GrownUp /><Celebrations /></>;
  switch (r) {
    case '/path': screen = <Path />; break;
    case '/review': screen = <Review />; break;
    case '/progress': screen = <Progress />; break;
    case '/trophies': screen = <Trophies />; break;
    case '/settings': screen = <Settings />; break;
    default: screen = <Home />;
  }
  return <><Shell>{screen}</Shell><Celebrations /></>;
}

export { navigate };
