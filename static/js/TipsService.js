/**
 * TipsService.js
 * 
 * Service for managing tips data in Sefaria
 * This service handles fetching, caching, and providing tips data
 * for different guide types across the application.
 */

class TipsService {
  constructor() {
    this._cache = {}; // Cache tips by guide type
    
    // Placeholder data until API is implemented
    this._placeholderData = {
      sheets: {
        titlePrefix: "Quick Start:", // Constant prefix for all tips in this guide type
        titlePrefix_heb: "התחלה מהירה:", // Hebrew prefix
        footerLinks: [ // Footer links consistent across all tips in this guide type
          { text: "Learn More About Source Sheets", url: "/help/sheets" },
          { text: "Send Feedback", url: "/feedback" }
        ],
        footerLinks_heb: [ // Hebrew footer links
          { text: "למד עוד על דפי מקורות", url: "/help/sheets" },
          { text: "שלח משוב", url: "/feedback" }
        ],
        tips: [
          {
            id: "sheets-1",
            title: "Add Sources from the Library", // Variable part of title
            title_heb: "הוסף מקורות מהספרייה",
            text: `
              <p>When you’re ready to publish and make your sheet available to Sefaria users:</p>
              <ul>
                <li>Copy your sheet URL and open it in another browser or a private window to see how it will look to other users.</li>
                <li>Write an interesting, clear title that captures the essence of your sheet.</li>
                <li>Tag your sheet with Topics so it will be discoverable.</li>
                <li>Write a summary and add tags so others can find your work.</li>
              </ul>
            `,
            imageUrl: null, // Will use placeholder
            text_heb: `
              <p>כשאתה מוכן לפרסם ולהפוך את הדף שלך לזמין למשתמשי ספריא:</p>
              <ul>
                <li>העתק את כתובת הדף שלך ופתח אותה בדפדפן אחר או בחלון פרטי כדי לראות איך זה ייראה למשתמשים אחרים.</li>
                <li>כתוב כותרת מעניינת וברורה שתופסת את המהות של הדף שלך.</li>
                <li>תייג את הדף שלך עם נושאים כדי שיהיה ניתן לגלות אותו.</li>
                <li>כתוב סיכום והוסף תגיות כדי שאחרים יוכלו למצוא את העבודה שלך.</li>
              </ul>
            `,
            imageUrl: null, // Will use placeholder
            imageAlt: "Adding sources to sheets",
            imageAlt_heb: "הוספת מקורות לדפים"
          },
          {
            id: "sheets-2",
            title: "Format and Customize Your Content",
            title_heb: "עצב והתאם אישית את התוכן שלך",
            text: "Add images, videos, and format your text with the rich text editor to create beautiful source sheets. Use the formatting toolbar to make your content stand out.",
            text_heb: "הוסף תמונות, סרטונים ועצב את הטקסט שלך עם עורך הטקסט העשיר כדי ליצור דפי מקורות יפים. השתמש בסרגל הכלים לעיצוב כדי להבליט את התוכן שלך.",
            imageUrl: null,
            imageAlt: "Formatting tools for sheets",
            imageAlt_heb: "כלי עיצוב לדפים"
          },
          {
            id: "sheets-3",
            title: "Publishing and Sharing Your Work - This is a longer title to test the truncation functionality.",
            title_heb: "פרסום ושיתוף העבודה שלך - זו כותרת ארוכה יותר לבדיקת פונקציונליות הקיצור.",
            text: "This is a longer text example to test the scrollable functionality. When you have a lot of content to display, the text area should become scrollable to maintain the layout integrity. You can add detailed explanations, step-by-step instructions, or comprehensive guides that might require more space than what's immediately visible. The scrollable area ensures that users can access all the information while keeping the overall component size manageable. This approach provides a better user experience by preventing the overlay from becoming too large and overwhelming on the screen. Users can scroll through the content at their own pace while still having access to navigation controls and other interface elements.",
            imageUrl: null,
            text_heb: "זוהי דוגמה לטקסט ארוך יותר לבדיקת הפונקציונליות הניתנת לגלילה. כאשר יש לך הרבה תוכן להציג, אזור הטקסט צריך להפוך לניתן לגלילה כדי לשמור על שלמות הפריסה. אתה יכול להוסיף הסברים מפורטים, הוראות שלב אחר שלב, או מדריכים מקיפים שעשויים לדרוש יותר מקום ממה שנראה מיד. האזור הניתן לגלילה מבטיח שמשתמשים יוכלו לגשת לכל המידע תוך שמירה על גודל הרכיב הכולל ניתן לניהול. גישה זו מספקת חוויית משתמש טובה יותר על ידי מניעת הפיכת הכיסוי לגדול מדי ומכריע על המסך. משתמשים יכולים לגלול דרך התוכן בקצב שלהם תוך שמירה על גישה לפקדי ניווט ואלמנטים אחרים של הממשק.",
            imageUrl: null,
            imageAlt: "Publishing and sharing sheets",
            imageAlt_heb: "פרסום ושיתוף דפים"
          }
        ]
      },
      test_heb: {
        titlePrefix: "Hebrew Test:", // English prefix for testing
        titlePrefix_heb: "בדיקה עברית:", // Hebrew prefix
        footerLinks: [
          { text: "Hebrew Test Link", url: "/test" },
          { text: "Another Link", url: "/test2" }
        ],
        footerLinks_heb: [
          { text: "קישור בדיקה עברית", url: "/test" },
          { text: "קישור נוסף", url: "/test2" }
        ],
        tips: [
          {
            id: "heb-test-1",
            title: "Hebrew Interface Test",
            title_heb: "בדיקת ממשק עברית",
            text: `
              <p>This is a test tip for Hebrew interface:</p>
              <ul>
                <li>Test Hebrew text rendering</li>
                <li>Test RTL layout</li>
                <li>Test font consistency</li>
              </ul>
            `,
            text_heb: `
              <p>זהו טיפ בדיקה לממשק עברית:</p>
              <ul>
                <li>בדיקת עיבוד טקסט עברי</li>
                <li>בדיקת פריסה מימין לשמאל</li>
                <li>בדיקת עקביות גופן</li>
              </ul>
            `,
            imageUrl: null,
            imageAlt: "Hebrew interface test",
            imageAlt_heb: "בדיקת ממשק עברית"
          },
          {
            id: "heb-test-2",
            title: "Mixed Content Test",
            title_heb: "בדיקת תוכן מעורב",
            text: "Testing mixed Hebrew and English content: שלום עולם! This should work properly in both directions.",
            text_heb: "בדיקת תוכן מעורב עברית ואנגלית: Hello World! זה צריך לעבוד כראוי בשני הכיוונים.",
            imageUrl: null,
            imageAlt: "Mixed content test",
            imageAlt_heb: "בדיקת תוכן מעורב"
          }
        ]
      }
    };
  }

  /**
   * Get tips for a specific guide type
   * @param {string} guideType - The type of guide (e.g., "sheets", "test_heb")
   * @returns {Promise} - Resolves to tips data with structure:
   *   {
   *     totalTips: number,
   *     titlePrefix: string,
   *     titlePrefix_heb?: string,
   *     footerLinks: Array<{text: string, url: string}>,
   *     footerLinks_heb?: Array<{text: string, url: string}>,
   *     tips: Array<{
   *       id: string, 
   *       title: string, 
   *       title_heb?: string,
   *       text: string, 
   *       text_heb?: string,
   *       imageUrl: string|null, 
   *       imageAlt: string,
   *       imageAlt_heb?: string
   *     }>
   *   }
   */
  async getTips(guideType = "sheets") {
    // Return from cache if available
    if (this._cache[guideType]) {
      console.log(`Returning cached tips for ${guideType}`);
      return this._cache[guideType];
    }
    
    console.log(`Fetching tips for ${guideType}`);
    
    // For now, return placeholder data
    // In the future, this would make an API call:
    // const data = await Sefaria._ApiPromise(`/api/tips/${guideType}`);
    
    // Simulate network delay for testing
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const data = this._placeholderData[guideType] || { 
      tips: [], 
      titlePrefix: "", 
      footerLinks: [] 
    };
    
    // Auto-calculate total tips count
    data.totalTips = data.tips.length;
    
    // Cache the data
    this._cache[guideType] = data;
    return data;
  }

  /**
   * Clear the tips cache
   */
  clearCache() {
    this._cache = {};
    console.log("Tips cache cleared");
  }
}

// Export a singleton instance
export const tipsService = new TipsService();

export default TipsService; 