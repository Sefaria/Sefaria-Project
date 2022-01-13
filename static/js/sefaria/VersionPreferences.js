import $ from "./sefariaJquery";
import Sefaria from "./sefaria";

class VersionPreferences {
    constructor(versionPrefsByCorpus) {
        this._versionPrefsByCorpus = versionPrefsByCorpus || {};
        this.update_cookie();
    }
    getVersionPref(sref) {
        const title = Sefaria.parseRef(sref).index
        const corpus = Sefaria.index(title).corpus;
        return this._versionPrefsByCorpus[corpus];
    }
    update(corpus, vtitle, lang) {
        const prefsClone = Sefaria.util.clone(this._versionPrefsByCorpus);
        prefsClone[corpus] = { vtitle, lang };

        return new VersionPreferences(prefsClone);
    }
    update_cookie() {
        $.cookie("version_preferences_by_corpus", JSON.stringify(this._versionPrefsByCorpus), {path: "/"});
    }
}

export default VersionPreferences;