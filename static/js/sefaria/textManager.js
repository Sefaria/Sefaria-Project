import {textCacheInstance as CACHE} from './TextCache';
import Sefaria from "./sefaria";
import read from "./api";

let defaultVersionsCache = {};

function getBookFromRef(ref) {
    //do we have something for that? maybe it should be passed as param to getVersions?
    return ref.split(' ').slice(1).join(' '); //assuming the ref is not a whole book
}

function getLanguageAndVersionTitle(book, language, versionType, translationLanguagePreference) {
    if (!language) {
        if (versionType === 'source') {
            return {};
        } else {
            language = translationLanguagePreference;
        }
    }
    const versionTitle = defaultVersionsCache[book]?.[language] || Sefaria.versionPreferences.getVersionPref(book)?.[language]; //can we also use versionPreferences for language?
    return {language: language, versionTitle: versionTitle};
}

function makeParamsString(language, versionTitle) {
    if (versionTitle) {
        return `${language}|${versionTitle}`;
    } else if (language) {
        return language;
    } else {
        return 'base'; //should be different for translation
    }
}

function getVersionFromAPI(ref, language, versionTitle) {
    const host = Sefaria.apiHost;
    const endPoint = '/api/v3/text/'
    const paramsString = makeParamsString(language, versionTitle);
    const url = `${host}${endPoint}${ref}?version=${paramsString}`;
    return read(url)
}

export default async function getVersions(ref, source, translation, translationLanguagePreference) {
    // ref is segment ref or bottom level section ref
    // source, translation are objects that can have language and versionTitle
    // translationLanguagePreference is on ReaderApp state and goind downward all components. it's not ideal but i don't see another way for now
    const book = getBookFromRef(ref);
    const versions = [];
    const data = {source: source, translation: translation};
    for (const versionType of data) {
        const requiredVersion = data[versionType];
        let { language, versionTitle } = { ...requiredVersion };
        if (!(language && versionTitle)) {
            ({ language, versionTitle } = getLanguageAndVersionTitle(book, language, versionType, translationLanguagePreference));
        }
        let version = CACHE.get(ref, language, versionTitle);
        if (version) {
            versions.push(version);
        } else {
            version = await getVersionFromAPI(ref, language, versionTitle);
            versions.push(version);
            CACHE.set(version);
            (defaultVersionsCache?.[book] ?? (defaultVersionsCache[book] = {}))[version.actualLanguage] = version.versionTitle;
        }
    }
    return versions;
}
