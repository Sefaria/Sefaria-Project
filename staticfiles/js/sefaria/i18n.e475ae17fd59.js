import i18n from 'i18next'
import Languagedetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import Sefaria from './sefaria'
import LanguagesJson from './localizationLanguage/combineSring'

const langs = {
    hebrew: "bo",
    chinese: "zh",
    english: "en"
}

i18n
.use(Languagedetector)
.use(initReactI18next)
.init({
    lng: langs[Sefaria.interfaceLang],
    fallbackLng: 'en',
    debug: false,
    resources: { ...LanguagesJson}
})


