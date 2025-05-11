import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import { InterfaceText } from './Misc';
import PlanDetail from './PlanDetail';
import PlanProgression from './PlanProgression';

// Categories for filtering
export const categories = [
  "all", "love", "anxiety", "healing", "anger",
  "hope", "depression", "fear", "peace", "stress", "patience", "loss", "jealousy", "grief"
];

const Plans = ({ userType }) => {
  const [plans, setPlans] = useState([]);
  const [userPlans, setUserPlans] = useState([]);
  const [completedPlans, setCompletedPlans] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('all'); // 'all', 'my', 'completed'

  // Fetch plans from API
  useEffect(() => {
    fetchAllPlans();
    fetchUserPlans();
    // fetchCompletedPlans();
  }, []);

  const fetchAllPlans = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/plans');
      if (!response.ok) {
        throw new Error('Failed to fetch plans');
      }
      const data = await response.json();
      setPlans(data.plans);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserPlans = async () => {
    try {
      const response = await fetch('/api/user-plans');
      if (!response.ok) {
        throw new Error('Failed to fetch user plans');
      }
      const data = await response.json();
      setUserPlans(data.plans);
    } catch (err) {
      console.error('Error fetching user plans:', err);
      // Don't set the main error state here to avoid blocking the UI
    }
  };

  // const fetchCompletedPlans = async () => {
  //   try {
  //     const response = await fetch('/api/user/plans/completed');
  //     if (!response.ok) {
  //       throw new Error('Failed to fetch completed plans');
  //     }
  //     const data = await response.json();
  //     setCompletedPlans(data.plans);
  //   } catch (err) {
  //     console.error('Error fetching completed plans:', err);
  //     // Don't set the main error state here to avoid blocking the UI
  //   }
  // };

  // Get current plans based on active tab
  const getCurrentPlans = () => {
    switch (activeTab) {
      case 'my':
        return userPlans;
      // case 'completed':
      //   return completedPlans;
      case 'all':
      default:
        return plans;
    }
  };

  // Filter plans based on search query and category
  const filteredPlans = getCurrentPlans().filter(plan => {
    const matchesSearch = plan.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' ? true : plan.categories.includes(selectedCategory);
    return matchesSearch && matchesCategory;
  });

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSelectedCategory('all');
    setSearchQuery('');
  };

  if (loading && activeTab === 'all') {
    return <div className="loading">Loading plans...</div>;
  }

  if (error && activeTab === 'all') {
    return <div className="error">Error: {error}</div>;
  }

  return (
    <div className="readerNavMenu plansPage sans-serif">
        <div className="content sans-serif">
          <div className="contentInnerr sans-serif">
            <div className="planDetail sans-serif">
                    {/* Search Bar and Create Plan Button */}
                    <div className="searchBarContainer">
                      <div className="searchBarWrapper">
                        <span className="searchIcon">
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="11" r="8"></circle>
                            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                          </svg>
                        </span>
                        <input
                          type="text"
                          placeholder="Search plans..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="searchInput"
                        />
                        
                        {userType === "Plan creator" ? (
                        <button 
                          className="createPlanButton"
                          onClick={() => {/* Add your create plan logic here */}}
                        >
                          <a href="/plans/new">
                          <svg xmlns="http://www.w3.org/2000/svg" width="19" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                          </svg>
                          Create a Plan
                          </a>
                        </button>
                      ) : null}
                      </div>
                    </div>

                    {/* Categories */}
                    <div className="plansCategories">
                      {categories.map(category => (
                        <button
                          key={category}
                          className={classNames('categoryButton', { active: selectedCategory === category })}
                          onClick={() => setSelectedCategory(category)}
                        >
                          <InterfaceText>{category.charAt(0).toUpperCase() + category.slice(1)}</InterfaceText>
                        </button>
                      ))}
                    </div>

                    {/* Tabs Navigation */}
                    <div className="planTabs">
                      <div 
                        className={classNames('planTab', { active: activeTab === 'all' })}
                        onClick={() => handleTabChange('all')}
                      >
                        <InterfaceText>All Plans</InterfaceText>
                      </div>
                      <div 
                        className={classNames('planTab', { active: activeTab === 'my' })}
                        onClick={() => handleTabChange('my')}
                      >
                        <InterfaceText>My Plans</InterfaceText>
                      </div>
                      <div 
                        className={classNames('planTab', { active: activeTab === 'completed' })}
                        onClick={() => handleTabChange('completed')}
                      >
                        <InterfaceText>Completed</InterfaceText>
                      </div>
                    </div>

                    {/* Plans List */}
                    {activeTab === 'all' && <AllPlans filteredPlans={filteredPlans} />}
                    {activeTab === 'my' && <MyPlans filteredPlans={filteredPlans} />}
                    {activeTab === 'completed' && <CompletedPlans filteredPlans={filteredPlans} />}
                    
                  </div>
          </div>
        </div>
    </div>
  );
};


Plans.propTypes = {
  multiPanel: PropTypes.bool.isRequired,
  toggleSignUpModal: PropTypes.func.isRequired,
  initialWidth: PropTypes.number.isRequired,
};

const AllPlans = ({filteredPlans}) => {
  return (
    <><div className="plansListHeader">
      <InterfaceText>All Plans</InterfaceText>
    </div><div className="plansList">
        {filteredPlans.length > 0 ? (
          filteredPlans.map(plan => (
            <a href={`/plans/${plan.id}`} key={plan.id} className="planCard">
              <div className="planImageWrapper">
                <img src={plan.imageUrl || "/static/img/plan-default.png"} alt={plan.title} className="planImage" />
                <div className="planCategories">
                  {plan.categories.map((category, index) => (
                    <span key={index} className="planCategory">
                      <InterfaceText>{category.charAt(0).toUpperCase() + category.slice(1)}</InterfaceText>
                      {index < plan.categories.length - 1 && <span className="categorySeparator"> • </span>}
                    </span>
                  ))}
                  <span className="categoryCount">+{plan.categories.length - 2 > 0 ? plan.categories.length - 2 : 1}</span>
                </div>
              </div>
              <h3 className="planTitle">
                <InterfaceText>{plan.title}</InterfaceText>
              </h3>
              <div className="planFooter">
                <span className="planDuration">{plan.total_days} days</span>
                <div to={`/${plan.id}`} className="readMoreLink">Read more</div>
              </div>
            </a>
          ))
        ) : (
          <p className="noPlansMessage">
            {activeTab === 'my' && <InterfaceText>You haven't joined any plans yet.</InterfaceText>}
            {/* {activeTab === 'completed' && <InterfaceText>You haven't completed any plans yet.</InterfaceText>} */}
            {activeTab === 'all' && <InterfaceText>No plans found.</InterfaceText>}
          </p>
        )}
      </div></>
  );
};

const MyPlans = ({ filteredPlans }) => {
  // Helper function to convert numbers to Tibetan numerals
  const toTibetanNumeral = (num) => {
    if (num === undefined || num === null) return '';
    const tibetanNumerals = ['༠', '༡', '༢', '༣', '༤', '༥', '༦', '༧', '༨', '༩'];
    return num.toString().split('').map(digit => {
      return tibetanNumerals[parseInt(digit)] || digit;
    }).join('');
  };

  // Format date to a more readable format
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  if (!filteredPlans || filteredPlans.length === 0) {
    return (
      <div className="emptyPlansMessage">
        <h2><InterfaceText>You haven't started any plans yet</InterfaceText></h2>
        <p><InterfaceText>Browse all plans and start one today!</InterfaceText></p>
      </div>
    );
  }

  return (
    <div className="myPlansContainer">
      <div className="plansGrid">
        {filteredPlans.map(plan => (
          <div key={plan.id} className="planCard">
            <a href={`/plans/${plan.plan_id}`} className="planCardLink">
              <div className="planCardHeader">
                <h3 className="planTitle">{plan.title}</h3>
                {plan.is_completed ? (
                  <span className="completionBadge completed">
                    <InterfaceText>Completed</InterfaceText>
                  </span>
                ) : (
                  <span className="completionBadge inProgress">
                    <InterfaceText>In Progress</InterfaceText>
                  </span>
                )}
              </div>
              
              <p className="planDescription">{plan.plan_description}</p>
              
              {/* Plan Progress Section */}
              <div className="planProgressContainer">
                <div className="progressBarContainer">
                  <div 
                    className="progressBar" 
                    style={{ width: `${plan.progress.completion_percentage}%` }}
                  ></div>
                </div>
                
                <div className="progressStats">
                  <div className="progressStat">
                    <span className="progressLabel"><InterfaceText>Current Day</InterfaceText></span>
                    <span className="progressValue">
                      {plan.current_day}/{plan.progress.total_days}
                    </span>
                  </div>
                  
                  <div className="progressStat">
                    <span className="progressLabel"><InterfaceText>Completion</InterfaceText></span>
                    <span className="progressValue">{plan.progress.completion_percentage}%</span>
                  </div>
                  
                  <div className="progressStat">
                    <span className="progressLabel"><InterfaceText>Days Remaining</InterfaceText></span>
                    <span className="progressValue">{plan.progress.days_remaining}</span>
                  </div>
                </div>
              </div>
              
              {/* Plan Dates Section */}
              <div className="planDates">
                <div className="planDate">
                  <span className="dateLabel"><InterfaceText>Started</InterfaceText></span>
                  <span className="dateValue">{formatDate(plan.started_at)}</span>
                </div>
                
                <div className="planDate">
                  <span className="dateLabel"><InterfaceText>Last Activity</InterfaceText></span>
                  <span className="dateValue">{formatDate(plan.last_activity_at)}</span>
                </div>
              </div>
            </a>
          </div>
        ))}
      </div>
    </div>
  );
};

const CompletedPlans = () => {
  return (
    <div>
      <h1><InterfaceText>Completed Plans</InterfaceText></h1>
    </div>
  );
};

export default Plans;