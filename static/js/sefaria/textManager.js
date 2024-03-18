import CACHE from './textCache';
import Sefaria from "./sefaria";
import read from "./api";

let defaultVersionsCache = {};

function getBookFromRef(ref) {
    const parsedRef = Sefaria.parseRef(ref);
    return parsedRef.book;
}

function getLanguageAndVersionTitle(book, language, versionType, translationLanguagePreference) {
    if (!language) {
        if (versionType === 'source') {
            language = 'primary';
        } else {
            language = translationLanguagePreference;
        }
    }
    const versionTitle = defaultVersionsCache[book]?.[language] || Sefaria.versionPreferences.getVersionPref(book)?.[language]; //can we also use versionPreferences for language?
    return {language: language, versionTitle: versionTitle};
}

function getRequiredParams(source, translation, translationLanguagePreference, book) {
    const requiredVersions = {source: source, translation: translation};
    for (const versionType in requiredVersions) {
        let {language, versionTitle} = {...requiredVersions[versionType]};
        if (!(language && versionTitle)) {
            requiredVersions[versionType] = getLanguageAndVersionTitle(book, language, versionType, translationLanguagePreference);
        }
    }
    return requiredVersions;
}

function getVersionsFromCache(ref, requiredVersions) {
    let returnObj = {};
    for (const versionType in requiredVersions) {
        let cacheObj = CACHE.get(ref, versionType.language, versionType.versionTitle);
        if (cacheObj) {
            if (returnObj === {}) {
                returnObj = cacheObj;
                returnObj[versionType] = returnObj.versions[0];
                delete returnObj.versions;
            } else {
                returnObj[versionType] = cacheObj.versions[0];
            }
        } else {
            return; //if one version is missing we'll take all of them form API
        }
    }
    return returnObj;
}

function makeParamsString(language, versionTitle) {
    if (versionTitle) {
        return `${language}|${versionTitle}`;
    } else if (language) {
        return language;
    }
}

function makeUrl(ref, requiredVersions) {
    const host = Sefaria.apiHost;
    const endPoint = '/api/v3/texts/'
    const versions = ['primary', 'translation']
    versions.push(requiredVersions.translation.language)
    Object.keys(requiredVersions).forEach(key => {
        let {language, versionTitle} = requiredVersions[key];
        const paramsString = makeParamsString(language, versionTitle);
        if (paramsString) {
            versions.push(paramsString);
        }
    })
    const url = `${host}${endPoint}${ref}?version=${versions.join('&version=')}`;
    return url;
}

function findSource(requiredVersion, apiObject) {
    return apiObject.versions.find((version) =>
        version.actualLanguage === requiredVersion.language &&
            version.versionTitle === requiredVersion.versionTitle //the exact required version
        ) ||
        apiObject.versions.find((version) => version.isBaseText) || null; //if not a base version
}

function findTranslation(requiredVersion, apiObject) {
    return apiObject.versions.find((version) =>
        version.actualLanguage === requiredVersion.language &&
            version.versionTitle === requiredVersion.versionTitle //the exact required version
        ) ||
        apiObject.versions.find((version) => !version.isSource &&
            version.actualLanguage === requiredVersion.language //if not, a translation in the required language
        ) ||
        apiObject.versions.find((version) => !version.isSource) || null; //if not, a translation
}

async function getVersionsFromAPI(ref, requiredVersions) {
    const url = makeUrl(ref, requiredVersions);
    const apiObject = await read(url);
    Sefaria.saveVersions(ref, apiObject.available_versions);
    delete apiObject.available_versions;
    CACHE.set(apiObject);
    apiObject.source = findSource(requiredVersions.source, apiObject)
    apiObject.translation = findTranslation(requiredVersions.translation, apiObject)
    delete apiObject.versions;
    return apiObject;
}

function setVersionsCache(book, version) {
    if (version) {
        (defaultVersionsCache?.[book] ?? (defaultVersionsCache[book] = {}))[version.actualLanguage] = version.versionTitle;
    }
}

export async function getVersions(ref, source, translation, translationLanguagePreference) {
    // ref is segment ref or bottom level section ref
    // source, translation are objects that can have language and versionTitle
    // translationLanguagePreference is on ReaderApp state and going downward all components. it's not ideal but i don't see another way for now
    const book = getBookFromRef(ref);
    const requiredVersions = getRequiredParams(source, translation, translationLanguagePreference, book);
    let returnObj = getVersionsFromCache(ref, requiredVersions) || await getVersionsFromAPI(ref, requiredVersions);
    [returnObj.source, returnObj.translation].forEach((version) => setVersionsCache(book, version));
    return returnObj;
}
