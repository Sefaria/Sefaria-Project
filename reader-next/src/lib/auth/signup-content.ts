/**
 * What the sign-up modal says for each action that needs an account. Copied from the old client's
 * signupModalContent.js (VERIFIED on sefaria.org for Notes and Add to Sheet); bullet icons are our icon set's.
 *
 * @feature GUI-004 Sign-up modal for anonymous users
 */
import type { IconName } from "~/ui/Icon/Icon";

export const SIGNUP_KINDS = ["add-connection","view-history","add-to-sheet","add-translation","follow","notes","save","default"] as const;
export type SignUpKind = (typeof SIGNUP_KINDS)[number];

export interface Bilingual { en: string; he: string }
export interface SignUpContent {
  h2: Bilingual;
  h3?: Bilingual;
  bullets: { icon: IconName; text: Bilingual }[];
}

export const SIGNUP_CONTENT: Record<SignUpKind, SignUpContent> = {
  "add-connection": {
    "h2": {
      "en": "Want to document a connection to another text?",
      "he": "רוצים לתעד חיבור לטקסט נוסף?"
    },
    "h3": {
      "en": "Create a free account to do more on Sefaria",
      "he": "פתחו חשבון משתמש בחינם - ותוכלו לעשות הרבה יותר עם ספריא"
    },
    "bullets": [
      {
        "icon": "link",
        "text": {
          "en": "Add interconnections & translations",
          "he": "הוסיפו תרגומים וחיבורים בין טקסטים"
        }
      },
      {
        "icon": "file-plus",
        "text": {
          "en": "Build & share source sheets",
          "he": "בנו ושתפו דפי מקורות"
        }
      },
      {
        "icon": "note",
        "text": {
          "en": "Take notes",
          "he": "רשמו הערות"
        }
      },
      {
        "icon": "mail",
        "text": {
          "en": "Get updates on new texts",
          "he": "התעדכנו בטקסטים חדשים הנוספים לספרייה"
        }
      }
    ]
  },
  "view-history": {
    "h2": {
      "en": "Want to see where you've been?",
      "he": "מעוניינים לחזור לקריאות האחרונות שלכם?"
    },
    "h3": {
      "en": "Create a free account to do more on Sefaria",
      "he": "פתחו חשבון משתמש בחינם כדי לעשות יותר עם ספריא"
    },
    "bullets": [
      {
        "icon": "clock",
        "text": {
          "en": "View your reading history",
          "he": "צפו בהיסטוריית הקריאה שלכם"
        }
      },
      {
        "icon": "star",
        "text": {
          "en": "Save texts",
          "he": "שמרו טקסטים"
        }
      },
      {
        "icon": "note",
        "text": {
          "en": "Take notes",
          "he": "כתבו הערות"
        }
      },
      {
        "icon": "file-plus",
        "text": {
          "en": "Build & share source sheets",
          "he": "צרו ושתפו דפי מקורות"
        }
      }
    ]
  },
  "add-to-sheet": {
    "h2": {
      "en": "Want to make your own source sheet?",
      "he": "רוצים ליצור דף מקורות משלכם?"
    },
    "h3": {
      "en": "Create a free account to join the conversation",
      "he": "פתחו חשבון משתמש בחינם כדי להוסיף דפי מקורות משלכם - ועוד:"
    },
    "bullets": [
      {
        "icon": "file-plus",
        "text": {
          "en": "Build & share source sheets",
          "he": "בנו ושתפו דפי מקורות"
        }
      },
      {
        "icon": "star",
        "text": {
          "en": "Save texts",
          "he": "שמרו טקסטים"
        }
      },
      {
        "icon": "note",
        "text": {
          "en": "Take notes",
          "he": "רשמו הערות"
        }
      },
      {
        "icon": "share",
        "text": {
          "en": "Connect with other users",
          "he": "התחברו עם משתמשי ספריא אחרים"
        }
      }
    ]
  },
  "add-translation": {
    "h2": {
      "en": "Have your own translation of this text?",
      "he": "יש לכם תרגום משלכם לטקסט זה?"
    },
    "h3": {
      "en": "Create a free account to add it to the library & do more on Sefaria",
      "he": "פתחו חשבון משתמש בחינם כדי להוסיף אותו לספרייה - ועוד:"
    },
    "bullets": [
      {
        "icon": "file-plus",
        "text": {
          "en": "Build & share source sheets",
          "he": "בנו ושתפו דפי מקורות"
        }
      },
      {
        "icon": "star",
        "text": {
          "en": "Save texts",
          "he": "שמרו טקסטים"
        }
      },
      {
        "icon": "note",
        "text": {
          "en": "Take notes",
          "he": "רשמו הערות"
        }
      },
      {
        "icon": "share",
        "text": {
          "en": "Connect with other users",
          "he": "התחברו עם משתמשי ספריא אחרים"
        }
      }
    ]
  },
  "follow": {
    "h2": {
      "en": "Want to connect with other Sefaria users?",
      "he": "רוצים להתחבר עם משתמשים אחרים בספריא?"
    },
    "h3": {
      "en": "Create a free account to join the conversation",
      "he": "פתחו חשבון משתמש בחינם והצטרפו לשיח"
    },
    "bullets": [
      {
        "icon": "user",
        "text": {
          "en": "Follow your favorite creators",
          "he": "עקבו אחרי היוצרים האהובים עליכם"
        }
      },
      {
        "icon": "file-plus",
        "text": {
          "en": "Build & share source sheets",
          "he": "בנו ושתפו דפי מקורות"
        }
      },
      {
        "icon": "note",
        "text": {
          "en": "Send messages",
          "he": "שלחו הודעות דרך ספריא"
        }
      }
    ]
  },
  "notes": {
    "h2": {
      "en": "Don’t lose that thought!",
      "he": "אל תשכחו את המחשבה שעלתה בכם!"
    },
    "h3": {
      "en": "Create a free account to do more on Sefaria",
      "he": "פתחו חשבון משתמש בחינם כדי לעשות יותר עם ספריא"
    },
    "bullets": [
      {
        "icon": "note",
        "text": {
          "en": "Take notes on this text",
          "he": "רשמו הערות על הטקסט שאתם לומדים"
        }
      },
      {
        "icon": "file-plus",
        "text": {
          "en": "Build & create source sheets",
          "he": "בנו ושתפו דפי מקורות"
        }
      },
      {
        "icon": "share",
        "text": {
          "en": "Connect with other users",
          "he": "התחברו עם משתמשים אחרים באתר"
        }
      },
      {
        "icon": "mail",
        "text": {
          "en": "Get updates on new features",
          "he": "קבלו עדכונים טכנולוגיים על תכונות חדשות בספריא"
        }
      }
    ]
  },
  "save": {
    "h2": {
      "en": "Want to return to this text?",
      "he": "רוצים לחזור לטקסט הזה?"
    },
    "h3": {
      "en": "Create a free account to do more on Sefaria",
      "he": "פתחו חשבון משתמש בחינם כדי לעשות יותר עם ספריא"
    },
    "bullets": [
      {
        "icon": "star",
        "text": {
          "en": "Save texts",
          "he": "שמרו טקסטים"
        }
      },
      {
        "icon": "note",
        "text": {
          "en": "Take notes",
          "he": "כתבו הערות"
        }
      },
      {
        "icon": "clock",
        "text": {
          "en": "View your reading history",
          "he": "צפו בהיסטוריית הקריאה שלכם"
        }
      },
      {
        "icon": "file-plus",
        "text": {
          "en": "Build & share source sheets",
          "he": "צרו ושתפו דפי מקורות"
        }
      }
    ]
  },
  "default": {
    "h2": {
      "en": "Love Learning?",
      "he": "אוהבים ללמוד?"
    },
    "h3": {
      "en": "Sign up to get more from Sefaria",
      "he": "הרשמו כדי לקבל יותר מספריא"
    },
    "bullets": [
      {
        "icon": "star",
        "text": {
          "en": "Save texts",
          "he": "שמרו טקסטים לקריאה חוזרת"
        }
      },
      {
        "icon": "file-plus",
        "text": {
          "en": "Make source sheets",
          "he": "הכינו דפי מקורות"
        }
      },
      {
        "icon": "note",
        "text": {
          "en": "Take notes",
          "he": "שמרו הערות"
        }
      },
      {
        "icon": "mail",
        "text": {
          "en": "Stay in the know",
          "he": "השארו מעודכנים"
        }
      }
    ]
  }
};

export const signUpContent = (kind: SignUpKind | undefined): SignUpContent => SIGNUP_CONTENT[kind ?? "default"] ?? SIGNUP_CONTENT.default;
