import tibetanJson from "./tibetan.json";
import chineseJson from "./chinese.json";
import englishJson from "./english.json";


// combine all languages string 
const LanguagesJson = {
        hebrew: {translation: tibetanJson},
        chinese:{translation: chineseJson},
        english:{translation: englishJson}
};

export default LanguagesJson;