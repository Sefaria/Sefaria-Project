/** Assistant dock strings: greeting per persona, starter prompts (same content as the widget), states. */
import { addStrings } from '../i18n';

addStrings({
  'assistant.headerButton': { en: 'Assistant', he: 'עוזר' },
  'assistant.suggestions': { en: 'Try asking', he: 'נסו לשאול' },
  'assistant.signin.title': { en: 'Sign in to chat', he: 'כניסה לחשבון כדי לשוחח' },
  'assistant.signin.body': { en: 'The assistant answers signed-in users. Sign in and come back to this page to ask.', he: 'העוזר עונה למשתמשים מחוברים. היכנסו לחשבון וחזרו לעמוד הזה כדי לשאול.' },
  'assistant.signin.pending': { en: 'After signing in, ask: “{prompt}”', he: 'אחרי הכניסה, שאלו: "{prompt}"' },
  'assistant.signin.action': { en: 'Sign in', he: 'כניסה' },
  'assistant.loading': { en: 'Connecting to the assistant…', he: 'מתחבר לעוזר…' },
  'assistant.unavailable': { en: 'The assistant could not be loaded right now. Try again later.', he: 'לא ניתן לטעון את העוזר כרגע. נסו שוב מאוחר יותר.' },
  'assistant.legacy': { en: 'This assistant build opens in the corner of the page.', he: 'גרסת העוזר הזאת נפתחת בפינת העמוד.' },

  'assistant.greeting.newcomer': { en: 'Welcome. Ask anything, and I will explain terms as we go. No Hebrew needed.', he: 'ברוכים הבאים. שאלו כל דבר, ואסביר מונחים תוך כדי. לא צריך עברית.' },
  'assistant.greeting.learner': { en: 'Good to see you back. Ask about what you are reading, or let me quiz you.', he: 'טוב לראות אתכם שוב. שאלו על מה שאתם קוראים, או תנו לי לבחון אתכם.' },
  'assistant.greeting.educator': { en: 'Planning a class? I can suggest sources, discussion questions and framing for your students.', he: 'מתכננים שיעור? אוכל להציע מקורות, שאלות לדיון ומסגור לתלמידים.' },
  'assistant.greeting.scholar': { en: 'Ask about versions, manuscripts and parallels. I will cite exact references.', he: 'שאלו על נוסחים, כתבי יד ומקבילות. אצטט מראי מקום מדויקים.' },

  'assistant.starter.newcomer.1': { en: 'What is the Talmud, and how is it different from the Torah?', he: 'מה זה התלמוד, ובמה הוא שונה מהתורה?' },
  'assistant.starter.newcomer.2': { en: "Where should I start reading if I'm new to Jewish texts?", he: 'מאיפה כדאי להתחיל לקרוא אם אני חדש בטקסטים יהודיים?' },
  'assistant.starter.newcomer.3': { en: "Explain this week's Torah portion in plain language.", he: 'הסבר לי את פרשת השבוע בשפה פשוטה.' },
  'assistant.starter.learner.1': { en: 'Quiz me on what I just read.', he: 'בחן אותי על מה שקראתי עכשיו.' },
  'assistant.starter.learner.2': { en: 'Summarize the main argument of this passage in three points.', he: 'סכם לי את הטיעון המרכזי בקטע הזה בשלוש נקודות.' },
  'assistant.starter.learner.3': { en: 'Which commentaries should I read next on this text?', he: 'אילו פרשנויות כדאי לי לקרוא בהמשך על הטקסט הזה?' },
  'assistant.starter.educator.1': { en: 'Give me three discussion questions for teaching this text.', he: 'תן לי שלוש שאלות לדיון להוראת הטקסט הזה.' },
  'assistant.starter.educator.2': { en: "Help me build a 45-minute lesson around this week's Torah portion.", he: 'עזור לי לבנות שיעור של 45 דקות סביב פרשת השבוע.' },
  'assistant.starter.educator.3': { en: 'Suggest sources on gratitude that suit a middle-school class.', he: 'הצע מקורות על הכרת הטוב שמתאימים לכיתת חטיבת ביניים.' },
  'assistant.starter.scholar.1': { en: 'Which manuscripts and versions exist for this text, and how do they differ?', he: 'אילו כתבי יד ונוסחים קיימים לטקסט הזה, ובמה הם נבדלים?' },
  'assistant.starter.scholar.2': { en: 'Compare how Rashi and Rambam read this passage.', he: 'השווה בין קריאת רש"י לקריאת הרמב"ם בקטע הזה.' },
  'assistant.starter.scholar.3': { en: 'Trace the earliest sources for this halakhah and its later development.', he: 'עקוב אחר המקורות המוקדמים ביותר להלכה זו ואחר התפתחותה המאוחרת.' },
});

/** The three starter prompts for a persona, in the current interface language. */
export const STARTER_COUNT = 3;
export function starterPromptKeys(persona) {
  return Array.from({ length: STARTER_COUNT }, (_, i) => `assistant.starter.${persona}.${i + 1}`);
}
