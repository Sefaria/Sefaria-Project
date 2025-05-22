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
        totalTips: 2,
        tips: [
          {
            id: "sheets-1",
            title: "Welcome to Source Sheets",
            text: "Create and share collections of texts and comments with Sefaria's Source Sheet editor.",
            imageUrl: "/static/img/logo/sefaria-logo.png",
            imageAlt: "Sefaria Sheets",
            links: [
              { text: "Learn More", url: "/help/sheets" },
              { text: "Feedback", url: "/feedback" }
            ]
          },
          {
            id: "sheets-2",
            title: "Formatting Your Sheets",
            text: "Add images, videos, and format your text with the rich text editor to create beautiful source sheets.",
            imageUrl: "/static/img/logo/sefaria-logo.png",
            imageAlt: "Formatting Tools",
            links: [
              { text: "View Examples", url: "/collections/Featured-Sheets" }
            ]
          }
        ]
      }
    };
  }

  /**
   * Get tips for a specific guide type
   * @param {string} guideType - The type of guide (currently only "sheets" supported)
   * @returns {Promise} - Resolves to tips data
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
    
    const data = this._placeholderData[guideType] || { tips: [], totalTips: 0 };
    
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