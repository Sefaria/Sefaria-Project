export const DEFAULT_LANGUAGE = 'english'

export const LANGUAGES = {
    'EN': 'english',
    'HE': 'hebrew',
}

export const cookieObject = {
    "name": "interfaceLang",
    "value": DEFAULT_LANGUAGE,
    "url": "https://sefaria.org",
}

export const testUser = {
    email: process.env.PLAYWRIGHT_USER_EMAIL,
    password: process.env.PLAYWRIGHT_USER_PASSWORD,
}

export const testAdminUser = {
    email: process.env.PLAYWRIGHT_SUPERUSER_EMAIL,
    password: process.env.PLAYWRIGHT_SUPERUSER_PASSWORD,
};