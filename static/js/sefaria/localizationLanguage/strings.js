
import TibetanStrings from "./tibetan";
import ChineseStrings from "./chinese";
import EnglishStrings from "./english";


// combine all languages string 
const Strings = {
    localizationStrings: {
        ...TibetanStrings,
        ...ChineseStrings,
        ...EnglishStrings
    }     
};

export default Strings;
