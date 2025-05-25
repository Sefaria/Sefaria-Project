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
        footerLinks: [ // Footer links consistent across all tips in this guide type
          { text: "Learn More About Source Sheets", url: "/help/sheets" },
          { text: "Send Feedback", url: "/feedback" }
        ],
        tips: [
          {
            id: "sheets-1",
            title: "Add Sources from the Library", // Variable part of title
            text: "When you are ready to publish, give your sheet an interesting title, write a summary and add tags so others can find your work.",
            imageUrl: null, // Will use placeholder
            imageAlt: "Adding sources to sheets"
          },
          {
            id: "sheets-2",
            title: "Format and Customize Your Content",
            text: "Add images, videos, and format your text with the rich text editor to create beautiful source sheets. Use the formatting toolbar to make your content stand out.",
            imageUrl: null,
            imageAlt: "Formatting tools for sheets"
          },
          {
            id: "sheets-3",
            title: "Publishing and Sharing Your Work - This is a longer title to test the truncation functionality.",
            text: "This is a longer text example to test the scrollable functionality. When you have a lot of content to display, the text area should become scrollable to maintain the layout integrity. You can add detailed explanations, step-by-step instructions, or comprehensive guides that might require more space than what's immediately visible. The scrollable area ensures that users can access all the information while keeping the overall component size manageable. This approach provides a better user experience by preventing the overlay from becoming too large and overwhelming on the screen. Users can scroll through the content at their own pace while still having access to navigation controls and other interface elements.",
            imageUrl: null,
            imageAlt: "Publishing and sharing sheets"
          }
        ]
      }
    };
  }

  /**
   * Get tips for a specific guide type
   * @param {string} guideType - The type of guide (currently only "sheets" supported)
   * @returns {Promise} - Resolves to tips data with structure:
   *   {
   *     totalTips: number,
   *     titlePrefix: string,
   *     footerLinks: Array<{text: string, url: string}>,
   *     tips: Array<{id: string, title: string, text: string, imageUrl: string|null, imageAlt: string}>
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