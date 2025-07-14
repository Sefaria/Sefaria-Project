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
    // These environment variables should be set in your local .env file
     email: process.env.PLAYWRIGHT_USER_EMAIL ?? '',
     password: process.env.PLAYWRIGHT_USER_PASSWORD ?? '',
}

export const testAdminUser = {
    // These environment variables should be set in your local .env file
    email: process.env.PLAYWRIGHT_SUPERUSER_EMAIL ?? '',
    password: process.env.PLAYWRIGHT_SUPERUSER_PASSWORD ?? '',
};