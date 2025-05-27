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
    
    // Placeholder data until API is implemented (sefaria.js/getTips())
    this._placeholderData = {
      sheets: {
        titlePrefix: {
          en: "Quick Start:",
          he: "התחלה מהירה:"
        },
        footerLinks: [
          { 
            text: {
              en: "Learn More About Source Sheets",
              he: "למד עוד על דפי מקורות"
            }, 
            url: "/help/sheets" 
          },
          { 
            text: {
              en: "Send Feedback",
              he: "שלח משוב"
            }, 
            url: "/feedback" 
          }
        ],
        tips: [
          {
            id: "sheets-1",
            title: {
              en: "Add Sources from the Library",
              he: "הוסף מקורות מהספרייה"
            },
            text: {
              en: `
                <p>When you're ready to publish and make your sheet available to Sefaria users:</p>
                <ul>
                  <li>Copy your sheet URL and open it in another browser or a private window to see how it will look to other users.</li>
                  <li>Write an interesting, clear title that captures the essence of your sheet.</li>
                  <li>Tag your sheet with Topics so it will be discoverable.</li>
                  <li>Write a summary and add tags so others can find your work.</li>
                </ul>
              `,
              he: `
                <p>כשאתה מוכן לפרסם ולהפוך את הדף שלך לזמין למשתמשי ספריא:</p>
                <ul>
                  <li>העתק את כתובת הדף שלך ופתח אותה בדפדפן אחר או בחלון פרטי כדי לראות איך זה ייראה למשתמשים אחרים.</li>
                  <li>כתוב כותרת מעניינת וברורה שתופסת את המהות של הדף שלך.</li>
                  <li>תייג את הדף שלך עם נושאים כדי שיהיה ניתן לגלות אותו.</li>
                  <li>כתוב סיכום והוסף תגיות כדי שאחרים יוכלו למצוא את העבודה שלך.</li>
                </ul>
              `
            },
            imageUrl: null, // Will use placeholder - TODO: Change to https://storage.cloud.google.com/guides-resources/test-video-tips-16x9.mp4
            imageAlt: {
              en: "Adding sources to sheets",
              he: "הוספת מקורות לדפים"
            }
          },
          {
            id: "sheets-2",
            title: {
              en: "Format and Customize Your Content",
              he: "עצב והתאם אישית את התוכן שלך"
            },
            text: {
              en: "Add images, videos, and format your text with the rich text editor to create beautiful source sheets. Use the formatting toolbar to make your content stand out.",
              he: "הוסף תמונות, סרטונים ועצב את הטקסט שלך עם עורך הטקסט העשיר כדי ליצור דפי מקורות יפים. השתמש בסרגל הכלים לעיצוב כדי להבליט את התוכן שלך."
            },
            imageUrl: null,
            imageAlt: {
              en: "Formatting tools for sheets",
              he: "כלי עיצוב לדפים"
            }
          },
          {
            id: "sheets-3",
            title: {
              en: "Publishing and Sharing Your Work - This is a longer title to test the truncation functionality.",
              he: "פרסום ושיתוף העבודה שלך - זו כותרת ארוכה יותר לבדיקת פונקציונליות הקיצור."
            },
            text: {
              en: "This is a longer text example to test the scrollable functionality. When you have a lot of content to display, the text area should become scrollable to maintain the layout integrity. You can add detailed explanations, step-by-step instructions, or comprehensive guides that might require more space than what's immediately visible. The scrollable area ensures that users can access all the information while keeping the overall component size manageable. This approach provides a better user experience by preventing the overlay from becoming too large and overwhelming on the screen. Users can scroll through the content at their own pace while still having access to navigation controls and other interface elements.",
              he: "זוהי דוגמה לטקסט ארוך יותר לבדיקת הפונקציונליות הניתנת לגלילה. כאשר יש לך הרבה תוכן להציג, אזור הטקסט צריך להפוך לניתן לגלילה כדי לשמור על שלמות הפריסה. אתה יכול להוסיף הסברים מפורטים, הוראות שלב אחר שלב, או מדריכים מקיפים שעשויים לדרוש יותר מקום ממה שנראה מיד. האזור הניתן לגלילה מבטיח שמשתמשים יוכלו לגשת לכל המידע תוך שמירה על גודל הרכיב הכולל ניתן לניהול. גישה זו מספקת חוויית משתמש טובה יותר על ידי מניעת הפיכת הכיסוי לגדול מדי ומכריע על המסך. משתמשים יכולים לגלול דרך התוכן בקצב שלהם תוך שמירה על גישה לפקדי ניווט ואלמנטים אחרים של הממשק."
            },
            imageUrl: null,
            imageAlt: {
              en: "Publishing and sharing sheets",
              he: "פרסום ושיתוף דפים"
            }
          }
        ]
      },
      test_heb: {
        titlePrefix: {
          en: "Hebrew Test:",
          he: "בדיקה עברית:"
        },
        footerLinks: [
          { 
            text: {
              en: "Hebrew Test Link",
              he: "קישור בדיקה עברית"
            }, 
            url: "/test" 
          },
          { 
            text: {
              en: "Another Link",
              he: "קישור נוסף"
            }, 
            url: "/test2" 
          }
        ],
        tips: [
          {
            id: "heb-test-1",
            title: {
              en: "Hebrew Interface Test",
              he: "בדיקת ממשק עברית"
            },
            text: {
              en: `
                <p>This is a test tip for Hebrew interface:</p>
                <ul>
                  <li>Test Hebrew text rendering</li>
                  <li>Test RTL layout</li>
                  <li>Test font consistency</li>
                </ul>
              `,
              he: `
                <p>זהו טיפ בדיקה לממשק עברית:</p>
                <ul>
                  <li>בדיקת עיבוד טקסט עברי</li>
                  <li>בדיקת פריסה מימין לשמאל</li>
                  <li>בדיקת עקביות גופן</li>
                </ul>
              `
            },
            imageUrl: null,
            imageAlt: {
              en: "Hebrew interface test",
              he: "בדיקת ממשק עברית"
            }
          },
          {
            id: "heb-test-2",
            title: {
              en: "Mixed Content Test",
              he: "בדיקת תוכן מעורב"
            },
            text: {
              en: "Testing mixed Hebrew and English content: שלום עולם! This should work properly in both directions.",
              he: "בדיקת תוכן מעורב עברית ואנגלית: Hello World! זה צריך לעבוד כראוי בשני הכיוונים."
            },
            imageUrl: null,
            imageAlt: {
              en: "Mixed content test",
              he: "בדיקת תוכן מעורב"
            }
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
   *     titlePrefix: {en: string, he: string},
   *     footerLinks: Array<{text: {en: string, he: string}, url: string}>,
   *     tips: Array<{
   *       id: string, 
   *       title: {en: string, he: string}, 
   *       text: {en: string, he: string}, 
   *       imageUrl: string|null, 
   *       imageAlt: {en: string, he: string}
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
    
    try {
      const data = await Sefaria.getTips(guideType);
      
      // Cache the data
      this._cache[guideType] = data;
      return data;
    } catch (error) {
      console.error(`Error fetching tips for ${guideType}:`, error);
      
      // Fallback to placeholder data if API fails
      const fallbackData = this._placeholderData[guideType] || { 
        tips: [], 
        titlePrefix: { en: "", he: "" }, 
        footerLinks: [] 
      };
      
      // Auto-calculate total tips count for fallback
      fallbackData.totalTips = fallbackData.tips.length;
      
      return fallbackData;
    }
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