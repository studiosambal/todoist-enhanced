import { describe, expect, it } from 'vitest';
import { dateSuggestions } from './dateWords';
import { nextOccurrence, plainRule } from './nextOccurrence';
import { readNaturalDate, readTime } from './nlp';
import { readRecurrence } from './recurrence';
import { item } from '@/test/items';

/* A Monday, so nothing below depends on which day the tests happen to run. */
const now = new Date(2026, 8, 28);
const read = (text: string) => readNaturalDate(text, now);

describe('a Dutch date is read out of a task name', () => {
  it.each([
    ['Bellen vandaag', '2026-09-28', 'vandaag'],
    ['Offerte sturen morgen', '2026-09-29', 'morgen'],
    ['Overmorgen afspraak', '2026-09-30', 'Overmorgen'],
    ['Plannen volgende week', '2026-10-05', 'volgende week'],
    ['Terugbellen over 3 dagen', '2026-10-01', 'over 3 dagen'],
    ['Nabellen over 2 weken', '2026-10-12', 'over 2 weken'],
    ['Oplevering vrijdag', '2026-10-02', 'vrijdag'],
    ['Overleg volgende dinsdag', '2026-09-29', 'volgende dinsdag'],
    ['Factuur 3 mei', '2027-05-03', '3 mei'],
    ['Opzeggen 1 mrt', '2027-03-01', '1 mrt'],
    ['Verjaardag 14 oktober', '2026-10-14', '14 oktober'],
  ])('%s', (text, date, matched) => {
    expect(read(text)).toMatchObject({ date, matched, hasTime: false });
  });

  it('today is the next week when the day named is today', () => {
    expect(read('maandag')?.date).toBe('2026-10-05');
  });

  it.each([
    ['Bellen morgen om 16:00', '2026-09-29T16:00:00', 'morgen om 16:00'],
    ['Bellen morgen om 10', '2026-09-29T10:00:00', 'morgen om 10'],
    ['Bellen morgen om 9 uur', '2026-09-29T09:00:00', 'morgen om 9 uur'],
    ['Bellen morgen 9u30', '2026-09-29T09:30:00', 'morgen 9u30'],
    ['Sporten morgenochtend', '2026-09-29T09:00:00', 'morgenochtend'],
    ['Eten koken vanavond', '2026-09-28T19:00:00', 'vanavond'],
    ['Borrel vrijdagmiddag', '2026-10-02T12:00:00', 'vrijdagmiddag'],
    ['Lezen morgen avond', '2026-09-29T19:00:00', 'morgen avond'],
  ])('a time or a part of the day goes with it: %s', (text, date, matched) => {
    expect(read(text)).toMatchObject({ date, matched, hasTime: true });
  });

  it('"morgen" alone is tomorrow, never the morning', () => {
    expect(readTime('morgen')).toBeNull();
    expect(read('morgen')).toMatchObject({ date: '2026-09-29', hasTime: false });
  });

  it.each([
    'Spread the work over 3 weeks',
    'Koffie met Morgens',
    'De dagen tellen',
    'Middagdutje overslaan',
  ])('reads nothing in "%s"', (text) => {
    expect(read(text)).toBeNull();
  });
});

describe('a Dutch repeat rule is found and handed to Todoist in Dutch', () => {
  it('finds the rule inside a title', () => {
    expect(readRecurrence('Planten water geven elke maandag')).toEqual({
      matched: 'elke maandag', index: 20, string: 'elke maandag', lang: 'nl', fromCompletion: false,
    });
  });

  /* Every phrase here is on the list Todoist publishes for Dutch, and goes as typed. */
  it.each([
    'elke dag', 'elk weekend', 'elke werkdag', 'elke weekdag', 'elke week', 'elke maand',
    'elk jaar', 'elk kwartaal', 'elk uur', 'elke ochtend', 'elke avond',
    'elke 3 dagen', 'elke 12 uur', 'elke 6 weken', 'elke 2 maanden',
    'elke maandag, vrijdag', 'elke ma, vrij', 'elke ma, di, woe, en vrij',
    'elke 3e vrijdag', 'elke eerste werkdag', 'elke laatste werkdag', 'elke laatste dag',
    'elke 27e', 'elke 27', 'elke 2, 15, 27', 'elke 27 jan', 'elke 14 jan, 14 apr',
    'elke andere dinsdag', 'om de dag', 'om de week', 'om het jaar', 'om de vrijdag',
    'elke dag om 20:00', 'elke ma, vrij om 20:00', 'elke laatste werkdag om 15:00',
    'elke maandag in de ochtend', 'elke vrijdag op de middag',
    'elke dag vanaf 3 aug', 'elke dag tot 3 aug', 'elke dag voor 3 weken',
    'elke 6 weken om 09:00 vanaf 3 jan',
    'dagelijks', 'wekelijks', 'maandelijks', 'jaarlijks',
  ])('reads %j whole', (text) => {
    expect(readRecurrence(text)).toMatchObject({ matched: text, string: text, lang: 'nl' });
  });

  it('reads "elke!" as counted from completion', () => {
    expect(readRecurrence('elke! 5 dagen')).toMatchObject({
      string: 'elke! 5 dagen', lang: 'nl', fromCompletion: true,
    });
  });

  /* What people type and Todoist's list does not show, sent as the listed word. */
  it.each([
    ['iedere maandag', 'elke maandag'],
    ['ieder jaar', 'elk jaar'],
    ['elke wo en vr', 'elke woe en vrij'],
    ['elke za, zo', 'elke zaterdag, zondag'],
    ['elke tweede dinsdag', 'elke 2e dinsdag'],
    ['elke 1ste maandag van de maand', 'elke 1e maandag'],
    ['elke eerste maandag van de maand om 9 uur', 'elke eerste maandag om 9'],
    ["elke dag 's ochtends", 'elke dag in de ochtend'],
    ['elke dag om 9 uur', 'elke dag om 9'],
    ['elke dag t/m 3 aug', 'elke dag tot 3 aug'],
    ['elke 5 mrt', 'elke 5 maart'],
  ])('%j goes to Todoist as %j', (typed, sent) => {
    expect(readRecurrence(typed)).toMatchObject({ matched: typed, string: sent, lang: 'nl' });
  });

  it('keeps "elke 3 uur" as every three hours', () => {
    expect(readRecurrence('elke 3 uur')?.string).toBe('elke 3 uur');
  });

  it.each([
    'melk kopen',
    'elke dag behalve zondag',
    'elke maandag behalve feestdagen',
    'Een week weg',
  ])('leaves %j alone', (text) => {
    expect(readRecurrence(text)).toBeNull();
  });

  it('does not take English or French for Dutch, or the other way round', () => {
    expect(readRecurrence('every monday')?.lang).toBe('en');
    expect(readRecurrence('tous les lundis')?.lang).toBe('fr');
    expect(readRecurrence('every mon, tue and fri')?.matched).toBe('every mon, tue and fri');
    expect(readRecurrence('every mon, tue, and fri')?.matched).toBe('every mon, tue, and fri');
  });

  it('reads the last day of the month in English too', () => {
    expect(readRecurrence('Pay rent every last day')?.string).toBe('every last day');
  });

  it('keeps the bound that follows a 24-hour time, in every language', () => {
    expect(readRecurrence('every 6 weeks at 09:00 starting 3 jan')?.matched)
      .toBe('every 6 weeks at 09:00 starting 3 jan');
    expect(readRecurrence('tous les jours à 9h30 pendant 3 semaines')?.matched)
      .toBe('tous les jours à 9h30 pendant 3 semaines');
  });
});

describe('date suggestions in Dutch', () => {
  it('offers the Dutch words first when the interface is Dutch', () => {
    expect(dateSuggestions('m', 'nl', now).map((s) => s.word)).toEqual(['morgen', 'maandag', 'monday']);
    expect(dateSuggestions('van', 'nl', now)).toEqual([{ word: 'vandaag', date: '2026-09-28' }]);
  });

  it('still offers them to somebody reading English', () => {
    expect(dateSuggestions('volg', 'en', now)).toEqual([{ word: 'volgende week', date: '2026-10-05' }]);
  });
});

describe('where a Dutch rule goes next', () => {
  // Wednesday 7 October 2026, mid-morning.
  const wednesday = new Date(2026, 9, 7, 10, 0);
  const recurring = (string: string, date: string) =>
    item({ due: { date, string, lang: 'nl', timezone: null, is_recurring: true } });
  const day = (date: Date | null) => date && `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;

  it('reads the plain rules from the due date', () => {
    expect(day(nextOccurrence(recurring('elke dag', '2026-10-07'), wednesday))).toBe('2026-10-8');
    expect(day(nextOccurrence(recurring('elke 3 dagen', '2026-10-07'), wednesday))).toBe('2026-10-10');
    expect(day(nextOccurrence(recurring('elke week', '2026-10-09'), wednesday))).toBe('2026-10-16');
    expect(day(nextOccurrence(recurring('elke 2 weken', '2026-10-09'), wednesday))).toBe('2026-10-23');
    expect(day(nextOccurrence(recurring('elke maandag', '2026-10-12'), wednesday))).toBe('2026-10-19');
    expect(day(nextOccurrence(recurring('elke ma, woe en vrij om 18:00', '2026-10-07T18:00:00'), wednesday))).toBe('2026-10-9');
    expect(day(nextOccurrence(recurring('elke werkdag', '2026-10-09'), wednesday))).toBe('2026-10-12');
    expect(day(nextOccurrence(recurring('elke! 3 dagen', '2026-10-07'), wednesday))).toBe('2026-10-10');
  });

  it('says nothing for a rule it does not lay out itself', () => {
    expect(nextOccurrence(recurring('elke 3e vrijdag', '2026-10-16'), wednesday)).toBeNull();
    expect(nextOccurrence(recurring('om de week', '2026-10-09'), wednesday)).toBeNull();
  });

  it('knows the days a habit falls on', () => {
    expect(plainRule({ string: 'dagelijks', is_recurring: true })).toEqual({ kind: 'day' });
    expect(plainRule({ string: 'elke di, do', is_recurring: true })).toEqual({ kind: 'days', days: [2, 4] });
    expect(plainRule({ string: 'tous les lundis et vendredis', is_recurring: true })).toEqual({ kind: 'days', days: [1, 5] });
  });
});
