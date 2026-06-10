import { useSettingsStore } from './store/useSettingsStore';

export type Lang = 'ru' | 'en';

/** Reactive UI language. Defaults to 'ru' until settings load. */
export function useLang(): Lang {
  return useSettingsStore((s) => (s.settings?.language as Lang) ?? 'ru');
}

/** Non-reactive read, for use outside React (stores, callbacks). */
export function getLang(): Lang {
  return (useSettingsStore.getState().settings?.language as Lang) ?? 'ru';
}

/** Pick the active-language branch of a co-located dictionary. */
export function pick<T>(lang: Lang, dict: { ru: T; en: T }): T {
  return dict[lang] ?? dict.ru;
}
