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

export const testLAUser = {
    // Whitelisted for the Library Assistant on www.sefaria.org.
    email: process.env.PLAYWRIGHT_LA_USER_EMAIL ?? '',
    password: process.env.PLAYWRIGHT_LA_USER_PASSWORD ?? '',
};

export const AUTH_PATHS = {
    enAdminFile: `auth_english_admin.json`,
    heAdminFile: `auth_hebrew_admin.json`,
    enUserFile: `auth_english_user.json`,
    heUserFile: `auth_hebrew_user.json`,
    enLAUserFile: `auth_english_la_user.json`,
}

export const BROWSER_SETTINGS = {
    // ⚠️ enAdmin (and heAdmin, same account) is the de-facto destructive-auth
    // throwaway profile: Sanity 7 in Sanity/user-flow-sanity.spec.ts performs
    // a real UI logout against this account every run, which destroys its
    // server-side session row and invalidates this storage state for any
    // concurrently-running worker still reading it. No other Sanity test
    // currently depends on enAdmin's session, so the destruction is harmless.
    // DO NOT add a Sanity-suite test that depends on enAdmin staying alive
    // without first moving Sanity 7 to a dedicated throwaway account. See
    // CLAUDE.md rule §2.21 and README §14 "Destructive auth tests".
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
    enLAUser: {
        file: AUTH_PATHS.enLAUserFile,
        lang: LANGUAGES.EN,
        user: testLAUser,
    },
};

// Parse and validate TIMEOUT_MULTIPLIER from environment
const rawMultiplier = parseFloat(process.env.TIMEOUT_MULTIPLIER || '1.0');
const clampedMultiplier = Math.min(3.0, Math.max(0.1, isNaN(rawMultiplier) ? 1.0 : rawMultiplier));
// Round to 1 decimal place
export const TIMEOUT_MULTIPLIER = Math.round(clampedMultiplier * 10) / 10;

/** Apply TIMEOUT_MULTIPLIER to a timeout value in ms */
export const t = (ms: number): number => Math.round(ms * TIMEOUT_MULTIPLIER);