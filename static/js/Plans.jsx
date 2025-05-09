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
    fetchCompletedPlans();
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
      const response = await fetch('/api/user/plans');
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

  const fetchCompletedPlans = async () => {
    try {
      const response = await fetch('/api/user/plans/completed');
      if (!response.ok) {
        throw new Error('Failed to fetch completed plans');
      }
      const data = await response.json();
      setCompletedPlans(data.plans);
    } catch (err) {
      console.error('Error fetching completed plans:', err);
      // Don't set the main error state here to avoid blocking the UI
    }
  };

  // Get current plans based on active tab
  const getCurrentPlans = () => {
    switch (activeTab) {
      case 'my':
        return userPlans;
      case 'completed':
        return completedPlans;
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

                    <div className="plansListHeader">
                      <h1>
                        {activeTab === 'all' && <InterfaceText>Featured Plans</InterfaceText>}
                        {activeTab === 'my' && <InterfaceText>My Plans</InterfaceText>}
                        {activeTab === 'completed' && <InterfaceText>Completed Plans</InterfaceText>}
                      </h1>
                    </div>
                    <div className="plansList">
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
                          {activeTab === 'completed' && <InterfaceText>You haven't completed any plans yet.</InterfaceText>}
                          {activeTab === 'all' && <InterfaceText>No plans found.</InterfaceText>}
                        </p>
                      )}
                    </div>
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

export default Plans;