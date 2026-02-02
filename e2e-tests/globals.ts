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

export const AUTH_PATHS = {
    enAdminFile: `auth_english_admin.json`,
    heAdminFile: `auth_hebrew_admin.json`,
    enUserFile: `auth_english_user.json`,
    heUserFile: `auth_hebrew_user.json`,
    heNoUserFile: `auth_hebrew_no_user.json`,
    enNoUserFile: `auth_english_no_user.json`,
}

export const BROWSER_SETTINGS = {
    enAdmin: {
        file: AUTH_PATHS.enAdminFile,
        lang: LANGUAGES.EN,
        user: testAdminUser,
    },
    heAdmin: {
        file: AUTH_PATHS.heAdminFile,
        lang: LANGUAGES.HE,
        user: testAdminUser,
    },
    enUser: {
        file: AUTH_PATHS.enUserFile,
        lang: LANGUAGES.EN,
        user: testUser,
    },
    heUser: {
        file: AUTH_PATHS.heUserFile,
        lang: LANGUAGES.HE,
        user: testUser,
    },
    english: {
        file: AUTH_PATHS.enNoUserFile,
        lang: LANGUAGES.EN,
        user: null,
    },
    hebrew: {
        file: AUTH_PATHS.heNoUserFile,
        lang: LANGUAGES.HE,
        user: null,
    },
};