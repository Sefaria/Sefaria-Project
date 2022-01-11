import $ from "./sefariaJquery";

class VersionPreferences {
    constructor(versionPrefsByCorpus) {
        this._versionPrefsByCorpus = versionPrefsByCorpus || {};
    }
    getVersionPref(sref) {
        const title = Sefaria.parseRef(sref).index
        const corpus = Sefaria.index(title).corpus;
        return this._versionPrefsByCorpus[corpus];
    }
    update(sref, versionTitle, lang) {
        const title = Sefaria.parseRef(sref).index
        const corpus = Sefaria.index(title).corpus;
        const prefsClone = Sefaria.util.clone(this._versionPrefsByCorpus);
        prefsClone[corpus] = { vtitle: versionTitle, lang };

        // side effects
        Sefaria.track.event("Reader", "Set Version Preference", `${corpus}|${lang}`);
        $.cookie("version_preferences", JSON.stringify(prefsClone), {path: "/"});

        return new VersionPreferences(prefsClone);
    }
}

export default VersionPreferences;