import React, { useState, useEffect } from 'react';
import Sheet from './Sheet';

const PlanProgression = ({planId, planData, onCitationClick}) => {
  const [currentDay, setCurrentDay] = useState(1);
  const [sheetData, setSheetData] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showDailyPath, setShowDailyPath] = useState(true);

  useEffect(() => {
    // Fetch sheet data when plan data is loaded or current day changes
    if (planData) {
      fetchDayContent(currentDay);
    }
  }, [currentDay]);

  const fetchDayContent = async (day) => {
    try {
      setIsLoading(true);
      // Get sheet_id from planData content
      const dayKey = `day ${day}`;
      const dayContent = planData.content[dayKey];
      
      if (!dayContent || !dayContent.sheet_id) {
        throw new Error('No sheet assigned for this day');
      }

      const sheetId = dayContent.sheet_id;
      const response = await fetch(`/api/sheets/${sheetId}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setSheetData(data);
      setError(null);
    } catch (error) {
      setError('There is no sheet assigned for this day, please create sheet and add it to the plan.');
      setSheetData(null);
      console.error('Error fetching day content:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const onRefClick = (ref) => {
    console.log("Ref clicked:", ref.target.getAttribute('href'));
    
    // // Check if ref is an element reference with an href attribute
    // if (ref && ref.target && ref.target.getAttribute) {
    //   const href = ref.target.getAttribute('href');
    //   if (href) {
    //     console.log("Href attribute:", href);
    //     // Use the href as needed
    //     // e.g., navigate to the link, or extract data from it
    //     return href;
    //   }
    // }

  };
  const handleDaySelect = (day) => {
    setCurrentDay(day);
  };

  const handleCitationClick = (citationRef, textRef, replace, currVersions) => {
    onCitationClick(citationRef, textRef, replace, currVersions);
    setShowDailyPath(false);
  };

  const openSheet = (sheetRef, replace = false) => {
    // Placeholder for opening a sheet
  };

  if (error) {
    return <div className="error-message">{error}</div>;
  }

  if (!planData) return <div>Loading plan data...</div>;

  // Use numeric ID for the back link to match the rest of the app's routing
  const numericId = planId.toString().replace('/progress', '');

  return (
    <div className="plan-progression">
      {/* Breadcrumb Navigation */}
      <nav className="breadcrumb-nav">
        <a href="/plans" className="breadcrumb-item">Home</a>
        <span className="breadcrumb-separator">›</span>
        <a href={`/plans/${numericId}`} className="breadcrumb-item">{planData.title}</a>
        <span className="breadcrumb-separator">›</span>
        <span className="breadcrumb-item current">Day {currentDay}</span>
        <button 
          className="hide-path-btn"
          onClick={() => setShowDailyPath((prev) => !prev)}
          title={showDailyPath ? "Hide Daily Path" : "Show Daily Path"}
        >
          <i className={`fa ${showDailyPath ? "fa-eye-slash" : "fa-eye"}`}></i> {showDailyPath ? "Hide Daily Path" : "Show Daily Path"}
        </button>
      </nav>

      <div className="content-wrapper">
        <div 
          className={`plan-navigation`}
          style={{ display: showDailyPath ? 'block' : 'none' }}
        > 
          {showDailyPath && (
            <>
              <div className="plan-header">
                <img 
                  src={planData.imageUrl || "/static/img/plan-default.png"} 
                  alt={planData.title} 
                  className="plan-thumbnail"
                />
                <div className="plan-info">
                  <h2 className="plan-title">{planData.title}</h2>
                  <span className="plan-duration">{planData.total_days} days</span>
                </div>
              </div>
              {/* Vertical Day Navigation */}
              <div className="day-list">
                {Array.from({ length: planData.total_days || 7 }, (_, i) => i + 1).map((day) => (
                  <button
                    key={day}
                    className={`day-button ${currentDay === day ? 'active' : ''}`}
                    onClick={() => handleDaySelect(day)}
                  >
                    Day {day}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Sheet Content */}
        <div className={`sheet-content`}> 
          {isLoading ? (
            <div>Loading day content...</div>
          ) : sheetData ? (
              <Sheet
                id={planData.content[`day ${currentDay}`]?.sheet_id}
                data={sheetData}
                hasSidebar={false}
                highlightedNode={null}
                multiPanel={false}
                onRefClick={onRefClick}
                onSegmentClick={() => {}}
                onCitationClick={handleCitationClick}
                setSelectedWords={() => {}}
                setDivineNameReplacement={() => {}}
                divineNameReplacement="noSub"
                openSheet={openSheet}
              />
          ) : (
            <div>No content available for this day</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PlanProgression;
