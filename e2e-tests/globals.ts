export const DEFAULT_LANGUAGE = 'english'

export const LANGUAGES = {
    'EN': 'english',
    'HE': 'hebrew',
}

export const SOURCE_LANGUAGES = {
    'EN': /^(תרגום|Translation)$/,
    'HE': /^(מקור|Source)$/,
    'BI': /^(מקור ותרגום|Source with Translation)$/
}

export const cookieObject = {
    "name": "interfaceLang",
    "value": DEFAULT_LANGUAGE,
    "url": "https://sefaria.org",
}

export const testUser = {
    email: 'test@example.com',
    password: 'test',
}