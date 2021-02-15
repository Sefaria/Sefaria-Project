import React from 'react';
const ContentLanguageContext = React.createContext({
  language: "english",
  //changeContextLanguage: (language) => {},
});
ContentLanguageContext.displayName = 'ContentLanguageContext'; //This lets us see this name in the devtools

export {
  ContentLanguageContext,
};