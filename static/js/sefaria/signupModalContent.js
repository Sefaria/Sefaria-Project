export const SignUpModalKind = {
  AddConnection: Symbol("Add Connection"),
  AddToSheet: Symbol("Add to Sheet"),
  Chavruta: Symbol("Chavruta"),
  AddTranslation: Symbol("Add Translation"),
  Follow: Symbol("Follow"),
  Notes: Symbol("Notes"),
  Save: Symbol("Save"),
  Default: Symbol("Default"),
};

const signUpModalContent = {
  [SignUpModalKind.AddConnection]: {
    h1En: "Want to document a connection to another text?",
    h2En: "Create a free account to do more on Sefaria",
    h1He: "רוצים לתעד חיבור לטקסט נוסף?",
    h2He: "פתחו חשבון משתמש בחינם - ותוכלו לעשות הרבה יותר עם ספריא",
    contentList: [
      [
        "tools-add-connection-white.svg",
        "Add interconnections & translations",
        "הוסיפו תרגומים וחיבורים בין טקסטים",
      ],
      [
        "sheetsplus-white.svg",
        "Build & share source sheets",
        "בנו ושתפו דפי מקורות",
      ],
      ["note-white.png", "Take notes", "רשמו הערות"],
      [
        "email-white.png",
        "Get updates on new texts",
        "התעדכנו בטקסטים חדשים הנוספים לספרייה",
      ],
    ],
  },
  [SignUpModalKind.AddToSheet]: {
    h1En: "Want to make your own source sheet?",
    h2En: "Create a free account to join the conversation",
    h1He: "רוצים ליצור דף מקורות משלכם?",
    h2He: "פתחו חשבון משתמש בחינם כדי להוסיף דפי מקורות משלכם - ועוד:",
    contentList: [
      [
        "sheetsplus-white.svg",
        "Build & share source sheets",
        "בנו ושתפו דפי מקורות",
      ],
      ["star-white.png", "Save texts", "שמרו טקסטים"],
      ["note-white.svg", "Take notes", "רשמו הערות"],
      [
        "share-icon-white.svg",
        "Connect with other users",
        "התחברו עם משתמשי ספריא אחרים",
      ],
    ],
  },
  [SignUpModalKind.Chavruta]: {
    h1En: "Want to study with a friend?",
    h2En: "Create a free account to start a chavruta video call",
    h1He: "רוצים להתחבר עם משתמשים אחרים בספריא?",
    h2He: "פתחו חשבון משתמש בחינם והצטרפו לשיח",
    contentList: [
      [
        "network-icon-white.svg",
        "Explore Torah together",
        "עקבו אחרי היוצרים האהובים עליכם",
      ],
      [
        "sheetsplus-white.svg",
        "Build & share source sheets",
        "בנו ושתפו דפי מקורות",
      ],
      ["feedback-white.svg", "Send messages", "שלחו הודעות דרך ספריא"],
      [
        "chavruta-white.svg",
        "Learn with a chavruta over video",
        "למדו עם חברותא באמצעות הווידיאו",
      ],
    ],
  },
  [SignUpModalKind.AddTranslation]: {
    h1En: "Have your own translation of this text?",
    h2En: "Create a free account to add it to the library & do more on Sefaria",
    h1He: "יש לכם תרגום משלכם לטקסט זה?",
    h2He: "פתחו חשבון משתמש בחינם כדי להוסיף אותו לספרייה - ועוד:",
    contentList: [
      [
        "sheetsplus-white.svg",
        "Build & share source sheets",
        "בנו ושתפו דפי מקורות",
      ],
      ["star-white.png", "Save texts", "שמרו טקסטים"],
      ["note-white.svg", "Take notes", "רשמו הערות"],
      [
        "share-icon-white.svg",
        "Connect with other users",
        "התחברו עם משתמשי ספריא אחרים",
      ],
    ],
  },
  [SignUpModalKind.Follow]: {
    h1En: "Want to connect with other Sefaria users?",
    h2En: "Create a free account to join the conversation",
    h1He: "רוצים להתחבר עם משתמשים אחרים בספריא?",
    h2He: "פתחו חשבון משתמש בחינם והצטרפו לשיח",
    contentList: [
      [
        "profile-white.svg",
        "Follow your favorite creators",
        "עקבו אחרי היוצרים האהובים עליכם",
      ],
      [
        "sheetsplus-white.svg",
        "Build & share source sheets",
        "בנו ושתפו דפי מקורות",
      ],
      ["note-white.svg", "Send messages", "שלחו הודעות דרך ספריא"],
      [
        "chavruta-white.svg",
        "Learn with a chavruta over video",
        "למדו עם חברותא באמצעות הווידיאו",
      ],
    ],
  },
  [SignUpModalKind.Notes]: {
    h1En: "Don’t lose that thought!",
    h2En: "Create a free account to do more on Sefaria",
    h1He: "אל תשכחו את המחשבה שעלתה בכם!",
    h2He: "פתחו חשבון משתמש בחינם כדי לעשות יותר עם ספריא",
    contentList: [
      [
        "note-white.svg",
        "Take notes on this text",
        "רשמו הערות על הטקסט שאתם לומדים",
      ],
      [
        "sheetsplus-white.svg",
        "Build & create source sheets",
        "בנו ושתפו דפי מקורות",
      ],
      [
        "share-icon-white.svg",
        "Connect with other users",
        "התחברו עם משתמשים אחרים באתר",
      ],
      [
        "email-white.png",
        "Get updates on new features",
        "קבלו עדכונים טכנולוגיים על תכונות חדשות בספריא",
      ],
    ],
  },
  [SignUpModalKind.Save]: {
    h1En: "Want to return to this text?",
    h2En: "Create a free account to do more on Sefaria",
    h1He: "רוצים לחזור לטקסט הזה?",
    h2He: "פתחו חשבון משתמש בחינם כדי לעשות יותר עם ספריא",
    contentList: [
      ["star-white.png", "Save texts", "שמרו טקסטים"],
      ["note-white.svg", "Take notes", "כתבו הערות"],
      [
        "clock-white.svg",
        "View your reading history",
        "צפו בהיסטוריית הקריאה שלכם",
      ],
      [
        "sheetsplus-white.svg",
        "Build & share source sheets",
        "צרו ושתפו דפי מקורות",
      ],
    ],
  },
  [SignUpModalKind.Default]: {
    h1En: "Love Learning?",
    h2En: "Sign up to get more from Sefaria",
    h1He: "אוהבים ללמוד?",
    h2He: "הרשמו כדי לקבל יותר מספריא",
    contentList: [
      ["star-white.png", "Save texts", "שמרו טקסטים לקריאה חוזרת"],
      ["sheet-white.png", "Make source sheets", "הכינו דפי מקורות"],
      ["note-white.png", "Take notes", "שמרו הערות"],
      ["email-white.png", "Stay in the know", "השארו מעודכנים"],
    ],
  },
};


export function generateContentForModal(signUpModalKind) {
  console.log(signUpModalKind);
  if (signUpModalContent.hasOwnProperty(signUpModalKind)) {
    return signUpModalContent[signUpModalKind];
  } else {
    return signUpModalContent[SignUpModalKind.Default];
  }
}