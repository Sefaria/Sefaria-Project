/**
 * TipsService.js
 *  
 * Service for managing tips data in Sefaria
 * This service handles fetching, caching, and providing tips data
 * for different guide types across the application.
 */

class TipsService {

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
   *       videoUrl: {en: string, he: string}, 
   *       videoAlt: {en: string, he: string}
   *     }>
   *   }
   */
  async getTips(guideType = "sheets") {
    console.log(`Fetching tips for ${guideType}`);
    
    try {
      return await Sefaria.getTips(guideType);
    } catch (error) {
      throw new Error(`Error fetching tips for ${guideType}:`, error);
    }
  }
}

// Export a singleton instance
export const tipsService = new TipsService();

export default TipsService; 
