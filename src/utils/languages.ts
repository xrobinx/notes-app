export const TRANSLATION_LANGUAGES = [
  { code: 'ms', label: 'Malay (Malaysia)', spellcheck: 'ms-MY' },
  { code: 'en', label: 'English', spellcheck: 'en-US' },
  { code: 'id', label: 'Indonesian', spellcheck: 'id-ID' },
  { code: 'ar', label: 'Arabic', spellcheck: 'ar' },
  { code: 'zh-CN', label: 'Chinese Simplified', spellcheck: 'zh-CN' },
  { code: 'ja', label: 'Japanese', spellcheck: 'ja-JP' },
  { code: 'ko', label: 'Korean', spellcheck: 'ko' },
  { code: 'es', label: 'Spanish', spellcheck: 'es-ES' },
  { code: 'fr', label: 'French', spellcheck: 'fr-FR' },
  { code: 'de', label: 'German', spellcheck: 'de-DE' },
  { code: 'hi', label: 'Hindi', spellcheck: 'hi-IN' },
  { code: 'ur', label: 'Urdu', spellcheck: 'ur-PK' },
] as const

export type TranslationLanguageCode = typeof TRANSLATION_LANGUAGES[number]['code']

export function getTranslationLanguage(code?: string | null) {
  return TRANSLATION_LANGUAGES.find(language => language.code === code) ?? TRANSLATION_LANGUAGES[0]
}
