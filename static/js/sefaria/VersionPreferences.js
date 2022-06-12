import $ from "./sefariaJquery";
import Sefaria from "./sefaria";

class VersionPreferences {
    constructor(versionPrefsByCorpus) {
        this._versionPrefsByCorpus = versionPrefsByCorpus || {};
        this.update_cookie();
    }
    getVersionPref(sref) {
        const title = Sefaria.parseRef(sref).index
        try{
            const corpus = Sefaria.index(title).corpus; //ref might have been a sheet sp no index at all, index may be null for other reasons or corpus field may not be present
            return this._versionPrefsByCorpus[corpus];  
        }catch (e){
            return null;
        }

    }
    update(corpus, vtitle, lang) {
        if (!corpus) { return this; }
        const prefsClone = Sefaria.util.clone(this._versionPrefsByCorpus);
        if (!prefsClone[corpus]) { prefsClone[corpus] = {}; }
        prefsClone[corpus][lang] = vtitle;

        return new VersionPreferences(prefsClone);
    }
    update_cookie() {
        $.cookie("version_preferences_by_corpus", JSON.stringify(this._versionPrefsByCorpus), {path: "/"});
    }
}

export default VersionPreferences;