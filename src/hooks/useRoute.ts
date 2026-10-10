import { useEffect, useState } from 'react';
import type { ViewId } from '@/domain/types';

export interface Route {
  view: ViewId;
  /** Project or label id, when the view needs one. */
  id?: string;
  /** A project section to reveal after navigation from global search. */
  sectionId?: string;
}

function parse(hash: string): Route {
  const raw = hash.replace(/^#\/?/, '');
  if (!raw) return { view: 'week' };
  const [path, query = ''] = raw.split('?');
  const [view, id] = path.split('/');
  // The dashboard is a tab of the insights page; an old link still lands there.
  if (view === 'dashboard') return { view: 'insights' };
  const known: ViewId[] = [
    'inbox', 'week', 'today', 'upcoming', 'someday', 'review',
    'settings', 'project', 'label', 'labels', 'matrix', 'map', 'insights',
  ];
  if (!known.includes(view as ViewId)) return { view: 'week' };
  const sectionId = view === 'project' ? new URLSearchParams(query).get('section') ?? undefined : undefined;
  return id ? { view: view as ViewId, id, sectionId } : { view: view as ViewId };
}

export const routeKey = (route: Route): string =>
  route.id ? `${route.view}:${route.id}` : route.view;

export function navigate(view: ViewId, id?: string, options?: { sectionId?: string }): void {
  const base = id ? `#/${view}/${id}` : `#/${view}`;
  window.location.hash = options?.sectionId
    ? `${base}?section=${encodeURIComponent(options.sectionId)}`
    : base;
}

/** The current destination, kept in the address bar so Back works in the PWA. */
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash));

  useEffect(() => {
    const onChange = () => setRoute(parse(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return route;
}
