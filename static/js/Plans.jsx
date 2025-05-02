import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import { InterfaceText } from './Misc';
import PlanDetail from './PlanDetail';
import PlanProgression from './PlanProgression';
// import '../css/plans.css';

const Plans = ({ userType }) => {
  const [plans, setPlans] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch plans from API
  useEffect(() => {
    const fetchPlans = async () => {
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

    fetchPlans();
  }, []);

  // Categories for filtering
  const categories = [
    "all", "anger", "love", "compassion", "wisdom", "mindfulness",
    "gratitude", "peace", "forgiveness", "equanimity", "meditation"
  ];

  // Filter plans based on search query and category
  const filteredPlans = plans.filter(plan => {
    const matchesSearch = plan.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' ? true : plan.categories.includes(selectedCategory);
    return matchesSearch && matchesCategory;
  });

  if (loading) {
    return <div className="loading">Loading plans...</div>;
  }

  if (error) {
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

                    {/* Plans List */}
                    <div className="plansListHeader">
                      <h1>Featured Plans</h1>
                      <a href="/all" className="viewAllLink">View all plans</a>
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
                        <p>No plans found.</p>
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