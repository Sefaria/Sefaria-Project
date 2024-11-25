import tibetanJson from "./tibetan.json";
import chineseJson from "./chinese.json";
import englishJson from "./english.json";


// combine all languages string 
const LanguagesJson = {
        en:{translation: englishJson},
        bo: {translation: tibetanJson},
        zh:{translation: chineseJson}
};

export default LanguagesJson;