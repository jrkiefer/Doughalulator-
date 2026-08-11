/**
 * Where the two notebooks live, kept on the phone. No password: the owner
 * chose to drop it, so a web address is the whole connection. Any key left in
 * a phone's stored settings from an older version is simply ignored.
 */
export interface SheetSettings {
  doughUrl: string;
  tempsUrl: string;
}

export const emptySettings: SheetSettings = {
  doughUrl: '',
  tempsUrl: '',
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
