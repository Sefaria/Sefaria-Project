import React, { useState, useEffect } from 'react';
import Sheet from './Sheet';

const PlanProgression = ({planId, planData, userPlanId, onCitationClick}) => {
  const [currentDay, setCurrentDay] = useState(1);
  const [sheetData, setSheetData] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showDailyPath, setShowDailyPath] = useState(true);
  const [userPlan, setUserPlan] = useState([]);

  useEffect(() => {
    // Fetch sheet data when plan data is loaded or current day changes
    if (planData) {
      fetchDayContent(currentDay);
    }
  }, [currentDay]);

  useEffect(() => {
    // Fetch sheet data when plan data is loaded or current day changes
    if (planData) {
      getUserPlan()
    }
  }, [userPlanId]);

  const getUserPlan = async () => {
    const response = await fetch(`/api/user-plans/${userPlanId}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();

    setUserPlan(data.plans[0]);
    setCurrentDay(data.plans[0].current_day);
  };
  
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


  const handleDaySelect = (day) => {
    setCurrentDay(day);
  };

  const handleCitationClick = (citationRef, textRef, replace, currVersions) => {
    onCitationClick(citationRef, textRef, replace, currVersions);
    setShowDailyPath(false);
  };

  const handleCompleteReading = async () => {
    try {
      // Call the API to mark the current day as complete
      const response = await fetch('/api/user-plans/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'mark_complete',
          plan_id: planId,
          day_number: currentDay
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Error marking day as complete:', errorData);
        return;
      }

      const data = await response.json();

      // Update the UI - move to the next day if not at the end
      if (currentDay < planData.total_days) {
        setCurrentDay(currentDay + 1);
      } else {
        alert('You have completed all days of the plan.');
          window.location.href = '/plans';

      }
    } catch (error) {
      console.error('Error completing reading:', error);
    }
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
                {Array.from({ length: planData.total_days || 7 }, (_, i) => i + 1).map((day) => {
                  // Check if this day is in the completed_days list
                  const isDayCompleted = userPlan && 
                                         userPlan.progress && 
                                         userPlan.progress.completed_days && 
                                         userPlan.progress.completed_days.includes(day.toString());
                  
                  return (
                    <button
                      key={day}
                      className={`day-button ${currentDay === day ? 'active' : ''} ${isDayCompleted ? 'completed' : ''}`}
                      onClick={() => handleDaySelect(day)}
                    >
                      Day {day} {isDayCompleted && <span className="day-completed-check">✓</span>}
                    </button>
                  );
                })}
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
                onRefClick={() => {}}
                onSegmentClick={() => {}}
                isPlan={true}
                currentDay={currentDay}
                onCitationClick={handleCitationClick}
                onCompleteReading={handleCompleteReading}
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
