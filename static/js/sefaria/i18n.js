import i18n from 'i18next'
import Languagedetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import Sefaria from './sefaria'

i18n
.use(Languagedetector)
.use(initReactI18next)
.init({
    lng: Sefaria.interfaceLang,
    fallbackLng: 'en',
    debug: true,
    resources: {
        english: {
            translation: {
                greeting: "hello from english {{name}}"
            }
        },
        hebrew: {
            translation: {
                greeting: "hello from Tibetan {{name}}"
            }
        }, 
        chinese: {
            translation: {
                greeting: "hello from Chinese {{name}}"
            }
        }
    }
})


