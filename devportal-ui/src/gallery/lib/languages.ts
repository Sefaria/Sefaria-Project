interface NativeName {
  text: string;
  /** BCP 47 code, so screen readers pronounce the name correctly. */
  code: string;
}

/** Each language's name in its own script. Omitted when it matches the English name. */
const NATIVE_NAMES: Readonly<Record<string, NativeName>> = {
  Amharic: { text: 'አማርኛ', code: 'am' },
  Arabic: { text: 'العربية', code: 'ar' },
  Aramaic: { text: 'ארמית', code: 'arc' },
  Bengali: { text: 'বাংলা', code: 'bn' },
  Bulgarian: { text: 'Български', code: 'bg' },
  Catalan: { text: 'Català', code: 'ca' },
  Chinese: { text: '中文', code: 'zh' },
  Croatian: { text: 'Hrvatski', code: 'hr' },
  Czech: { text: 'Čeština', code: 'cs' },
  Danish: { text: 'Dansk', code: 'da' },
  Dutch: { text: 'Nederlands', code: 'nl' },
  Finnish: { text: 'Suomi', code: 'fi' },
  French: { text: 'Français', code: 'fr' },
  German: { text: 'Deutsch', code: 'de' },
  Greek: { text: 'Ελληνικά', code: 'el' },
  Hebrew: { text: 'עברית', code: 'he' },
  Hindi: { text: 'हिन्दी', code: 'hi' },
  Hungarian: { text: 'Magyar', code: 'hu' },
  Indonesian: { text: 'Bahasa Indonesia', code: 'id' },
  Italian: { text: 'Italiano', code: 'it' },
  Japanese: { text: '日本語', code: 'ja' },
  Korean: { text: '한국어', code: 'ko' },
  Ladino: { text: 'לאדינו', code: 'lad' },
  Latin: { text: 'Latina', code: 'la' },
  Norwegian: { text: 'Norsk', code: 'no' },
  Persian: { text: 'فارسی', code: 'fa' },
  Polish: { text: 'Polski', code: 'pl' },
  Portuguese: { text: 'Português', code: 'pt' },
  Romanian: { text: 'Română', code: 'ro' },
  Russian: { text: 'Русский', code: 'ru' },
  Serbian: { text: 'Српски', code: 'sr' },
  Spanish: { text: 'Español', code: 'es' },
  Swahili: { text: 'Kiswahili', code: 'sw' },
  Swedish: { text: 'Svenska', code: 'sv' },
  Thai: { text: 'ไทย', code: 'th' },
  Turkish: { text: 'Türkçe', code: 'tr' },
  Ukrainian: { text: 'Українська', code: 'uk' },
  Urdu: { text: 'اردو', code: 'ur' },
  Vietnamese: { text: 'Tiếng Việt', code: 'vi' },
  Yiddish: { text: 'ייִדיש', code: 'yi' },
};

/**
 * Language names that can appear in a project's free-form tags. Tags are
 * matched case-insensitively and shown in this canonical spelling.
 */
const LANGUAGE_NAMES = [
  'Amharic',
  'Arabic',
  'Aramaic',
  'Bengali',
  'Bulgarian',
  'Catalan',
  'Chinese',
  'Croatian',
  'Czech',
  'Danish',
  'Dutch',
  'English',
  'Esperanto',
  'Finnish',
  'French',
  'German',
  'Greek',
  'Hebrew',
  'Hindi',
  'Hungarian',
  'Indonesian',
  'Italian',
  'Japanese',
  'Korean',
  'Ladino',
  'Latin',
  'Norwegian',
  'Persian',
  'Polish',
  'Portuguese',
  'Romanian',
  'Russian',
  'Serbian',
  'Spanish',
  'Swahili',
  'Swedish',
  'Tagalog',
  'Thai',
  'Turkish',
  'Ukrainian',
  'Urdu',
  'Vietnamese',
  'Yiddish',
] as const;

const BY_LOWER = new Map<string, string>(LANGUAGE_NAMES.map((name) => [name.toLowerCase(), name]));

/** The canonical language name for a tag, or null when the tag is not a language. */
export function languageName(tag: string): string | null {
  return BY_LOWER.get(tag.trim().toLowerCase()) ?? null;
}

/** The language's name in its own script (e.g. עברית) and its language code, or null when none is shown. */
export function nativeLanguageName(name: string): NativeName | null {
  return NATIVE_NAMES[name] ?? null;
}
