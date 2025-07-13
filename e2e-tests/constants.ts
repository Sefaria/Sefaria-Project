/**
 * Constant variables for E2E tests
 */

// Interface for save state objects
export interface SaveState {
  text: RegExp;
  textHebrew: RegExp;
  tooltip: RegExp;
  tooltipHebrew: RegExp;
}

//Strings for testing save state indicators, currently only in use for the source sheet editor page

export const SaveStates: Record<string, SaveState> = {
    saved: {
      text: /Saved/i,
      textHebrew: /נשמר/i,
      tooltip: /Your sheet is saved to Sefaria/i,
      tooltipHebrew: /דף המקורות שלך שמור בספריא/i,
    },
    saving: {
      text: /Saving/i,
      textHebrew: /שומר/i,
      tooltip: /We are saving your changes to Sefaria/i,
      tooltipHebrew: /כעת מתבצעת שמירת השינויים שלך בספריא/i,
    },
    loggedOut: {
      text: /User logged out/i,
      textHebrew: /בוצעה התנתקות מהמערכת/i,
      tooltip: /You are not logged in to Sefaria/i,
      tooltipHebrew: /כעת אינך מחובר\/ת לספריא/i,
    },
    tryingToConnect: {
      text: /Trying to connect/i,
      textHebrew: /ניסיון התחברות/i,
      tooltip: /No internet connection detected/i,
      tooltipHebrew: /לא זוהה חיבור לאינטרנט/i,
    },
    catchAllFifthState: {
      text: /Something went wrong. Try refreshing the page./i,
      textHebrew: /משהו השתבש. יש לנסות לרענן את העמוד/i,
      tooltip: /If this problem persists, please try again later and contact us at hello@sefaria.org/i,
      tooltipHebrew: /אם הבעיה נמשכת, אנא נסו לרענן שוב מאוחר יותר וצרו איתנו קשר בכתובת hello@sefaria.org/i,
    },
  };
  
  