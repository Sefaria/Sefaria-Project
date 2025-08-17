export const layoutOptions = {
    'mono': ['continuous', 'segmented'],
    'bi-rtl': ['stacked', 'heRight'],
    'bi-ltr': ['stacked', 'heLeft'],
    'mixed': ['stacked', 'heLeft', 'heRight'],
};
export const layoutLabels = {
    'continuous': 'Show Text as a paragram',
    'segmented': 'Show Text segmented',
    'stacked': 'Show Source & Translation Stacked',
    'heRight': 'Show RTL Text Right of LTR Text',
    'heLeft': 'Show RTL Text Left of LTR Text',
}

// Constants for the deprecation notification
export const DEPRECATION_DATE = "October 15, 2025";
export const DEPRECATION_DATE_HEBREW = "15 באוקטובר 2025";

export const DEPRECATION_LINKS = {
    en: {
    exportSheet: "https://help.sefaria.org/hc/en-us/articles/20532656851228-How-to-Export-Print-or-Share-a-Sheet",
    extension: "https://help.sefaria.org/hc/en-us/sections/20235182393244-Sefaria-for-Google-Docs"
    },
    he: {
    exportSheet: "https://help.sefaria.org/hc/he/articles/20532656851228-ייצוא-הדפסה-ושיתוף-דף-מקורות-בספריא",
    extension: "https://help.sefaria.org/hc/he/sections/20235182393244-התוסף-של-ספריא-ל-Google-Docs"
    }
};

export const DEPRECATION_MESSAGES = {
    en: {
    notice: "Please note:",
    mainMessage: `The divine name substitution tool will no longer be available in the Sefaria Sheet Editor after ${DEPRECATION_DATE}.`,
    continuationMessage: "If you would like to continue making changes to how the divine name appears in your sheets prior to printing, ",
    exportText: "export your sheet to Google Docs ",
    andText: "and use the 'Transform Divine Names' feature in the ",
    extensionText: "Sefaria for Google Docs extension",
    period: "."
    },
    he: {
    notice: "שימו לב:",
    mainMessage: `החל מה-${DEPRECATION_DATE_HEBREW}, לא יהיה ניתן לשנות שמות קודש בדפי מקורות באמצעות העורך של ספריא.`,
    continuationMessage: "מתאריך זה והלאה, על מנת לשנות את אופן הכתיבה של שמות הקודש בדף המקורות שלכם לפני הדפסת הדף, ",
    exportText: "יש לייצא את הדף ל-Google Docs ",
    andText: "ולבצע את השינוי באמצעות הכלי המיועד לכך ב",
    extensionText: "תוסף של ספריא ל-Google Docs",
    period: "."
    }
};
