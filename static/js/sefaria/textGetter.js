import Sefaria from "./sefaria";

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
    const versions = Object.entries(requiredVersions).map(([language, versionTitle]) =>
        makeParamsString(language, versionTitle)
    );
    const url = `${host}${endPoint}${ref}?version=${versions.join('&version=')}&fill_in_missing_segments=true`;
    return url;
}

async function getVTextsFromAPI(ref, requiredVersions) {
    const url = makeUrl(ref, requiredVersions);
    const apiObject = await Sefaria._ApiPromise(url);
    Sefaria.saveVersions(ref, apiObject.available_versions);
    delete apiObject.available_versions;
    return apiObject;
}

export async function getTexts(ref, requiredVersions) {
    // ref is segment ref or bottom level section ref
    // requiredVersions is array of objects that can have language and versionTitle
    let returnObj = await getVersionsFromAPI(ref, requiredVersions);
    return returnObj;
}
