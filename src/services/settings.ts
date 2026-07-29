/** Connection settings for the two Apps Script web apps, kept on the phone. */
export interface SheetSettings {
  doughUrl: string;
  doughSecret: string;
  tempsUrl: string;
  tempsSecret: string;
}

export const emptySettings: SheetSettings = {
  doughUrl: '',
  doughSecret: '',
  tempsUrl: '',
  tempsSecret: '',
};

const KEY = 'doughalulator.settings';

export function loadSettings(): SheetSettings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...emptySettings, ...JSON.parse(raw) } : emptySettings;
  } catch {
    return emptySettings;
  }
}

export function saveSettings(settings: SheetSettings): void {
  localStorage.setItem(KEY, JSON.stringify(settings));
}
