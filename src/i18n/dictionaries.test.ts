import { describe, expect, it, vi } from 'vitest';
import { en } from './en';
import { fr } from './fr';
import { nl } from './nl';
import { detectLocale, intlLocale, LOCALES, LOCALE_NAMES, translate } from './index';

const placeholders = (text: string): string[] => [...new Set(text.match(/\{\w+\}/g) ?? [])].sort();

describe.each([['fr', fr], ['nl', nl]] as const)('the %s dictionary', (_name, dictionary) => {
  const words = dictionary as Record<string, string>;

  it('has every string the English one has, and no other', () => {
    expect(Object.keys(words).sort()).toEqual(Object.keys(en).sort());
  });

  it('leaves no string empty', () => {
    expect(Object.entries(words).filter(([, text]) => text.trim() === '').map(([key]) => key)).toEqual([]);
  });
});

describe('the Dutch dictionary', () => {
  it('fills in every placeholder the English string fills in', () => {
    const off = Object.entries(en)
      .filter(([key, text]) => {
        const want = placeholders(text);
        const have = placeholders((nl as Record<string, string>)[key]);
        /* A singular form may spell its number out ("Een wijziging") and drop {count}. */
        return want.some((name) => !have.includes(name) && !(name === '{count}' && key.endsWith('_one')));
      })
      .map(([key]) => key);
    expect(off).toEqual([]);
  });

  it('is offered, by its own name, and picked for a Dutch browser', () => {
    expect(LOCALES).toContain('nl');
    expect(LOCALE_NAMES.nl).toBe('Nederlands');
    expect(intlLocale('nl')).toBe('nl-NL');
    vi.stubGlobal('navigator', { language: 'nl-BE' });
    try {
      expect(detectLocale()).toBe('nl');
      vi.stubGlobal('navigator', { language: 'de-DE' });
      expect(detectLocale()).toBe('en');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('counts in Dutch', () => {
    expect(translate('nl', 'metrics.tasks', { count: 1 })).toBe('1 taak');
    expect(translate('nl', 'metrics.tasks', { count: 3 })).toBe('3 taken');
  });
});
