// https://www.sohamkamani.com/javascript/enums/#enums-with-classes
export class SignUpModalKind {
  static AddConnection = new SignUpModalKind("Add Connection");
  static AddToSheet = new SignUpModalKind("Add to Sheet");
  static AddTranslation = new SignUpModalKind("Add Translation");
  static Chavruta = new SignUpModalKind("Chavruta");
  static Follow = new SignUpModalKind("Follow");
  static Notes = new SignUpModalKind("Notes");
  static Save = new SignUpModalKind("Save");

  constructor(name) {
    this.name = name;
  }
}

export function generateContentForModal(signUpModalKind) {
  switch (signUpModalKind) {
    case SignUpModalKind.AddConnection:
      return {
        h1En: "Want to document a connection to another text?",
        h2En: "Create a free account to do more on Sefaria",
        h1He: "רוצים לתעד חיבור לטקסט נוסף?",
        h2He: "פתחו חשבון משתמש בחינם - ותוכלו לעשות הרבה יותר עם ספריא",
        contentList: [
          [
            "tools-add-connection.svg",
            "Add interconnections & translations",
            "הוסיפו תרגומים וחיבורים בין טקסטים",
          ],
          [
            "sheetsplus.svg",
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
      };
    case SignUpModalKind.AddToSheet:
      return {
        h1En: "Want to make your own source sheet?",
        h2En: "Create a free account to join the conversation",
        h1He: "רוצים ליצור דף מקורות משלכם?",
        h2He: "פתחו חשבון משתמש בחינם כדי להוסיף דפי מקורות משלכם - ועוד:",
        contentList: [
          [
            "sheetsplus.svg",
            "Build & share source sheets",
            "בנו ושתפו דפי מקורות",
          ],
          ["star-white.png", "Save texts", "שמרו טקסטים"],
          ["notes.svg", "Take notes", "רשמו הערות"],
          [
            "share-icon.svg",
            "Connect with other users",
            "התחברו עם משתמשי ספריא אחרים",
          ],
        ],
      };
    case SignUpModalKind.Chavruta:
      return {
        h1En: "Want to study with a friend?",
        h2En: "Create a free account to start a chavruta video call",
        h1He: "רוצים להתחבר עם משתמשים אחרים בספריא?",
        h2He: "פתחו חשבון משתמש בחינם והצטרפו לשיח",
        contentList: [
          [
            "network-icon.svg",
            "Explore Torah together",
            "עקבו אחרי היוצרים האהובים עליכם",
          ],
          [
            "sheetsplus.svg",
            "Build & share source sheets",
            "בנו ושתפו דפי מקורות",
          ],
          ["feedback.svg", "Send messages", "שלחו הודעות דרך ספריא"],
          [
            "chavruta.svg",
            "Learn with a chavruta over video",
            "למדו עם חברותא באמצעות הווידיאו",
          ],
        ],
      };
    case SignUpModalKind.AddTranslation:
      return {
        h1En: "Have your own translation of this text?",
        h2En: "Create a free account to add it to the library & do more on Sefaria",
        h1He: "יש לכם תרגום משלכם לטקסט זה?",
        h2He: "פתחו חשבון משתמש בחינם כדי להוסיף אותו לספרייה - ועוד:",
        contentList: [
          [
            "sheetsplus.svg",
            "Build & share source sheets",
            "בנו ושתפו דפי מקורות",
          ],
          ["star-white.png", "Save texts", "שמרו טקסטים"],
          ["notes.svg", "Take notes", "רשמו הערות"],
          [
            "share-icon.svg",
            "Connect with other users",
            "התחברו עם משתמשי ספריא אחרים",
          ],
        ],
      };
    case SignUpModalKind.Follow:
      return {
        h1En: "Want to connect with other Sefaria users?",
        h2En: "Create a free account to join the conversation",
        h1He: "רוצים להתחבר עם משתמשים אחרים בספריא?",
        h2He: "פתחו חשבון משתמש בחינם והצטרפו לשיח",
        contentList: [
          [
            "profile.svg",
            "Follow your favorite creators",
            "עקבו אחרי היוצרים האהובים עליכם",
          ],
          [
            "sheetsplus.svg",
            "Build & share source sheets",
            "בנו ושתפו דפי מקורות",
          ],
          ["notes.svg", "Send messages", "שלחו הודעות דרך ספריא"],
          [
            "chavruta.svg",
            "Learn with a chavruta over video",
            "למדו עם חברותא באמצעות הווידיאו",
          ],
        ],
      };
    case SignUpModalKind.Notes:
      return {
        h1En: "Don’t lose that thought!",
        h2En: "Create a free account to do more on Sefaria",
        h1He: "אל תשכחו את המחשבה שעלתה בכם!",
        h2He: "פתחו חשבון משתמש בחינם כדי לעשות יותר עם ספריא",
        contentList: [
          [
            "notes.svg",
            "Take notes on this text",
            "רשמו הערות על הטקסט שאתם לומדים",
          ],
          [
            "sheetsplus.svg",
            "Build & create source sheets",
            "בנו ושתפו דפי מקורות",
          ],
          [
            "share-icon.svg",
            "Connect with other users",
            "התחברו עם משתמשים אחרים באתר",
          ],
          [
            "email-white.png",
            "Get updates on new features",
            "קבלו עדכונים טכנולוגיים על תכונות חדשות בספריא",
          ],
        ],
      };
    case SignUpModalKind.Save:
      return {
        h1En: "Want to return to this text?",
        h2En: "Create a free account to do more on Sefaria",
        h1He: "רוצים לחזור לטקסט הזה?",
        h2He: "פתחו חשבון משתמש בחינם כדי לעשות יותר עם ספריא",
        contentList: [
          ["star-white.png", "Save texts", "שמרו טקסטים"],
          ["notes.svg", "Take notes", "כתבו הערות"],
          [
            "readinghistory.svg",
            "View your reading history",
            "צפו בהיסטוריית הקריאה שלכם",
          ],
          [
            "sheetsplus.svg",
            "Build & share source sheets",
            "צרו ושתפו דפי מקורות",
          ],
        ],
      };
  }
}