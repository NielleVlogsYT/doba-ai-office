import { isVoiceLanguage } from '../../shared/config'
import { DEFAULT_SETTINGS, MAX_ADDRESS, MAX_RULES, type OfficeSettings } from '../../shared/memory'

const STORAGE_KEY = 'bullpen.settings.v1'

export function loadSettings(): OfficeSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed = JSON.parse(raw) as Partial<OfficeSettings>
    return {
      rules: typeof parsed.rules === 'string' ? parsed.rules.slice(0, MAX_RULES) : '',
      addressAs: typeof parsed.addressAs === 'string' ? parsed.addressAs.slice(0, MAX_ADDRESS) : '',
      language: isVoiceLanguage(parsed.language) ? parsed.language : 'en',
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(settings: OfficeSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // A full browser: the settings still hold for this visit.
  }
}
