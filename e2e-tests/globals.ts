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
    email: 'test@example.com',
    password: 'test',
}

export const testAdminUser = {
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
};