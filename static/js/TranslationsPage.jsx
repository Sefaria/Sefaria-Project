import Sefaria from "./sefaria/sefaria"
import { useState, useEffect } from "react";

const TranslationsPage = ({translationsSlug}) => {
    let translation = Sefaria.getTranslation(translationsSlug).then(x => {
        console.log(x);
        console.log(Sefaria._translations)
    });
    console.log(translation)
    return(<div>HI</div>)
}

export default TranslationsPage