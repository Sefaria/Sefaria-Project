import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import Sheet from './Sheet';
import Sefaria from './sefaria/sefaria';

const PlanProgression = () => {
  const { planId } = useParams();
  const [currentDay, setCurrentDay] = useState(1);
  const [planData, setPlanData] = useState(null);
  const [sheetData, setSheetData] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showDailyPath, setShowDailyPath] = useState(true);

  // Example MongoDB ObjectId for testing: "67ef5e6f2946808aa7605e0b"
  const MOCK_PLAN_ID_MAP = {
    "1": "67ef5e6f2946808aa7605e0b",
    "2": "67ef8746e711c3fd29b70e17",
    "3": "67ef8746e711c3fd29b70e18"
  };

  useEffect(() => {
    // Fetch plan data when component mounts
    fetchPlanData();
  }, [planId]);

  useEffect(() => {
    // Fetch sheet data when plan data is loaded or current day changes
    if (planData) {
      fetchDayContent(currentDay);
    }
  }, [currentDay, planData]);

  const getMongoId = (numericId) => {
    // Remove any 'progress' suffix and convert to string
    const cleanId = numericId.toString().replace('/progress', '');
    return MOCK_PLAN_ID_MAP[cleanId] || cleanId;
  };

  const fetchPlanData = async () => {
    try {
      const mongoId = getMongoId(planId);
      const response = await fetch(`/api/plans/${mongoId}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setPlanData(data);
      setError(null);
    } catch (error) {
      setError('Failed to load plan data. Please try again later.');
    }
  };

  const fetchDayContent = async (day) => {
    try {
      setIsLoading(true);
      const mongoId = getMongoId(planId);
      const response = await fetch(`/api/plans/${mongoId}/day_${day}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setSheetData(data);
      setError(null);
    } catch (error) {
      setError('Failed to load day content. Please try again later.');
      setSheetData(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDaySelect = (day) => {
    setCurrentDay(day);
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
        <Link to="/" className="breadcrumb-item">Home</Link>
        <span className="breadcrumb-separator">›</span>
        <Link to={`/${numericId}`} className="breadcrumb-item">{planData.title}</Link>
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
        <div className={`plan-navigation${showDailyPath ? '' : ' slide-out'}`}> 
          {showDailyPath && (
            <>
              <div className="plan-header">
                <img 
                  src={planData.image || '/static/img/plans/default.jpg'} 
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
        <div className={`sheet-content${showDailyPath ? '' : ' centered-sheet'}`}> 
          {isLoading ? (
            <div>Loading day content...</div>
          ) : sheetData && sheetData.content ? (
            <Sheet
              id={sheetData.sheet_id}
              data={sheetData.content}
              hasSidebar={false}
              highlightedNode={null}
              multiPanel={false}
              onRefClick={() => {}}
              onSegmentClick={() => {}}
              onCitationClick={() => {}}
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
