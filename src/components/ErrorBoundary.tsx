import { Component, type ErrorInfo, type ReactNode } from 'react';
import { FEEDBACK_URL } from '@/app-info';

/**
 * What the person sees when the page itself crashes (#128).
 *
 * Without a boundary an exception while drawing blanks the whole page white,
 * with no message and no way to say what happened. This says that something
 * broke, offers the one thing that usually fixes it, and links the bug form.
 *
 * The words are written here, in every language, rather than looked up: the
 * translation hook may be exactly what failed. The language is the one the page
 * already wears. It borrows the connect screen's look and adds none of its own.
 */
const WORDS = {
  en: {
    title: 'Something went wrong',
    body: 'The page ran into a problem and could not carry on. Reloading usually fixes it.',
    reload: 'Reload',
    report: 'Tell us what happened',
  },
  fr: {
    title: "Quelque chose s'est mal passé",
    body: "La page a rencontré un problème et n'a pas pu continuer. La recharger le règle en général.",
    reload: 'Recharger',
    report: 'Nous dire ce qui s\'est passé',
  },
  nl: {
    title: 'Er ging iets mis',
    body: 'De pagina liep tegen een probleem aan en kon niet verder. Opnieuw laden lost het meestal op.',
    reload: 'Opnieuw laden',
    report: 'Vertel ons wat er gebeurde',
  },
} as const;

interface State { failed: boolean }

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const page = document.documentElement.lang ?? '';
    const lang = page.startsWith('fr') ? 'fr' : page.startsWith('nl') ? 'nl' : 'en';
    const words = WORDS[lang];
    return (
      <div className="connect" role="alert">
        <div className="connect-card">
          <div className="connect-head"><h1>{words.title}</h1></div>
          <p className="connect-intro">{words.body}</p>
          <button className="btn primary lg connect-submit" onClick={() => window.location.reload()}>
            {words.reload}
          </button>
          <p className="connect-privacy">
            <a href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer">{words.report}</a>
          </p>
        </div>
      </div>
    );
  }
}
