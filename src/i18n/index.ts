import { en, type TranslationKey } from './en';
import { fr } from './fr';
import { nl } from './nl';

export const LOCALES = ['en', 'fr', 'nl'] as const;
export type Locale = (typeof LOCALES)[number];

/** Each language under its own name, for the places it is chosen. */
export const LOCALE_NAMES: Record<Locale, string> = { en: 'English', fr: 'Français', nl: 'Nederlands' };

/** The locale `Intl` is asked for: how dates, times and numbers are written. */
const INTL: Record<Locale, string> = { en: 'en-GB', fr: 'fr-FR', nl: 'nl-NL' };
export const intlLocale = (locale: Locale): string => INTL[locale] ?? INTL.en;
export type { TranslationKey };

const dictionaries: Record<Locale, Record<TranslationKey, string>> = { en, fr, nl };

/** Picks the interface language from the browser the first time the app runs. */
export function detectLocale(): Locale {
  if (typeof navigator === 'undefined') return 'en';
  const language = navigator.language.toLowerCase();
  return LOCALES.find((locale) => locale !== 'en' && language.startsWith(locale)) ?? 'en';
}

export type TranslateValues = Record<string, string | number>;

/**
 * Looks up a string and fills in its placeholders.
 *
 * A key ending in a count uses the `_one` / `_other` pair, which is all the
 * plural handling English, French and Dutch need here.
 */
export function translate(
  locale: Locale,
  key: TranslationKey,
  values?: TranslateValues,
): string {
  const dictionary = dictionaries[locale] ?? en;
  let template: string | undefined = dictionary[key];

  if (values && typeof values.count === 'number') {
    const plural = values.count === 1 ? `${key}_one` : `${key}_other`;
    const pluralised = (dictionary as Record<string, string>)[plural];
    if (pluralised) template = pluralised;
  }

  if (template === undefined) {
    // A missing string must never blank out the interface.
    return (en as Record<string, string>)[key] ?? key;
  }

  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}
