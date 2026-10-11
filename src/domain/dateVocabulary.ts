/**
 * The words for the months and the days of the week, in every interface
 * language, written once for every reader of dates.
 *
 * Folded (lower case, no accents) and written as regex alternatives, longest
 * forms and abbreviations side by side: `'september|sept|sep'`. A reader adds
 * its own boundary after them, because "mar" is March and also the start of
 * "marrons", and "mai" is May and also the start of "maisons" (#123). The
 * repeat-rule reader and the date reader both draw on these lists, so a word
 * is a month in both or in neither.
 */

/** The languages dates are read in: the interface languages. */
export type DateLang = 'en' | 'fr' | 'nl';

/** Twelve entries, January first. */
export const MONTH_WORDS: Record<DateLang, string[]> = {
  en: ['january|jan', 'february|feb', 'march|mar', 'april|apr', 'may', 'june|jun',
    'july|jul', 'august|aug', 'september|sept|sep', 'october|oct', 'november|nov',
    'december|dec'],
  fr: ['janvier|janv', 'fevrier|fevr', 'mars', 'avril|avr', 'mai', 'juin',
    'juillet|juil', 'aout', 'septembre|sept', 'octobre|oct', 'novembre|nov',
    'decembre|dec'],
  nl: ['januari|jan', 'februari|feb', 'maart|mrt', 'april|apr', 'mei', 'juni|jun',
    'juli|jul', 'augustus|aug', 'september|sept|sep', 'oktober|okt', 'november|nov',
    'december|dec'],
};

/** Seven entries, Sunday first, as `Date.getDay()` counts them. */
export const WEEKDAY_WORDS: Record<DateLang, string[]> = {
  en: ['sunday|sun', 'monday|mon', 'tuesday|tues|tue', 'wednesday|weds|wed',
    'thursday|thurs|thur|thu', 'friday|fri', 'saturday|sat'],
  fr: ['dimanches?|dim', 'lundis?|lun', 'mardis?|mar', 'mercredis?|mer',
    'jeudis?|jeu', 'vendredis?|ven', 'samedis?|sam'],
  /* The two-letter forms a Dutch calendar prints, and the longer ones Todoist
     documents ("woe", "vrij"). Only ever read straight after "elke". */
  nl: ['zondag|zon|zo', 'maandag|ma', 'dinsdag|di', 'woensdag|woe|wo',
    'donderdag|do', 'vrijdag|vrij|vr', 'zaterdag|zat|za'],
};
