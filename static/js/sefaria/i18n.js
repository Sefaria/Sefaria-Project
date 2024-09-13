import i18n from 'i18next'
import Languagedetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import Sefaria from './sefaria'
import LanguagesJson from './localizationLanguage/combineSring'

i18n
.use(Languagedetector)
.use(initReactI18next)
.init({
    lng: Sefaria.interfaceLang,
    fallbackLng: 'en',
    debug: false,
    resources: { ...LanguagesJson}
})


