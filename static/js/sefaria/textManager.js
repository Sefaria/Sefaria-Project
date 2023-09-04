import CACHE from './TextCache';
import Sefaria from "./sefaria";
import read from "./api";

let defaultVersionsCache = {};

function getBookFromRef(ref) {
    const parsedRef = Sefaria.parseRef(ref);
    //do we have something for that? maybe it should be passed as param to getVersions?
    return parsedRef.book;
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

async function getVersionFromAPI(ref, language, versionTitle) {
    const host = Sefaria.apiHost;
    const endPoint = '/api/v3/texts/'
    const paramsString = makeParamsString(language, versionTitle);
    const url = `${host}${endPoint}${ref}?version=${paramsString}`;
    return await read(url)
}

function _complete_text_settings(s = null) {
    let settings = s || {};
    settings = {
      commentary: settings.commentary || 0,
      context:    settings.context    || 0,
      pad:        settings.pad        || 0,
      translation:  {language: 'en', versionTitle: settings.enVersion  || null},
      source:  {language: 'he', versionTitle: settings.heVersion  || null},
      multiple:   settings.multiple   || 0,
      stripItags: settings.stripItags || 0,
      wrapLinks:  ("wrapLinks" in settings) ? settings.wrapLinks : 1,
      wrapNamedEntities: ("wrapNamedEntities" in settings) ? settings.wrapNamedEntities : 1,
      translationLanguagePreference: settings.translationLanguagePreference || null,
      versionPref: settings.versionPref || null,
      firstAvailableRef: ("firstAvailableRef" in settings) ? settings.firstAvailableRef : 1,
      fallbackOnDefaultVersion: ("fallbackOnDefaultVersion" in settings) ? settings.fallbackOnDefaultVersion : 1,
    };
    if (settings.versionPref) {
      // for every lang/vtitle pair in versionPref, update corresponding version url param if it doesn't already exist
      for (let [vlang, vtitle] of Object.entries(settings.versionPref)) {
        const versionPrefKey = `${vlang}Version`;
        if (!settings[versionPrefKey]) {
          settings[versionPrefKey] = vtitle;
        }
      }
    }
    return settings;
  }

export async function getVersionsByRef(ref, settings) {
    const {source, translation, translationLanguagePreference} = _complete_text_settings(settings);
    return await getVersions(ref, source, translation, translationLanguagePreference);
  }


export async function getVersions(ref, source, translation, translationLanguagePreference) {
    // ref is segment ref or bottom level section ref
    // source, translation are objects that can have language and versionTitle
    // translationLanguagePreference is on ReaderApp state and goind downward all components. it's not ideal but i don't see another way for now
    const book = getBookFromRef(ref);
    const versions = [];
    const data = {source: source, translation: translation};
    for (const versionType in data) {
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
