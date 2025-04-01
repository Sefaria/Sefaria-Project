import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { BrowserRouter as Router, Switch, Route, Link } from 'react-router-dom';
import classNames from 'classnames';
import { InterfaceText } from './Misc';
import PlanDetail from './PlanDetail';
// import '../css/plans.css';

// Mock data for now
const MOCK_PLANS = [
  {
    id: 1,
    title: "Mindful Breathing",
    categories: ["mindfulness", "meditation"],
    description: "A 7-day journey exploring the practice of mindful breathing, connecting with the present moment.",
    image: "/static/img/plans/meditation.jpeg",
    total_days: 7,
    content: [
      "Day 1: Introduction to mindfulness and breathing exercises.",
      "Day 2: Focus on body awareness and grounding techniques.",
      "Day 3: Practice mindful eating and savoring each bite.",
      "Day 4: Explore walking meditation in nature.",
      "Day 5: Cultivate mindfulness in daily activities.",
      "Day 6: Deepen your practice with a guided meditation.",
      "Day 7: Reflect on your mindfulness journey and set intentions."
    ]
  },
  {
    id: 2,
    title: "Loving-Kindness Meditation",
    categories: ["love", "compassion"],
    description: "A 5-day practice to cultivate compassion and loving-kindness toward yourself and others, transforming.",
    image: "/static/img/plans/meditation.jpeg",
    total_days: 5,
    content: [
      "Day 1: Understanding compassion and its importance.",
      "Day 2: Practice self-compassion with affirmations.",
      "Day 3: Extend compassion to loved ones through visualization.",
      "Day 4: Cultivate compassion for strangers and the world.",
      "Day 5: Reflect on your growth in compassion."
    ]
  },
  {
    id: 3,
    title: "Transforming Anger",
    categories: ["anger", "peace"],
    description: "A 6-day exploration of understanding and transforming anger through Buddhist principles and.",
    image: "/static/img/plans/meditation.jpeg",
    total_days: 6,
    content: ["Day 1: Identify triggers.", "Day 2: Practice calming techniques.", "Day 3: Reflect on progress.", "Day 4: Deepen understanding.", "Day 5: Apply techniques.", "Day 6: Conclude."]
  },
  {
    id: 4,
    title: "Cultivating Love",
    categories: ["love"],
    description: "A 4-day plan to foster love in your life.",
    image: "/static/img/plans/meditation.jpeg",
    total_days: 4,
    content: ["Day 1: Self-love.", "Day 2: Love for family.", "Day 3: Love for friends.", "Day 4: Universal love."]
  },
  {
    id: 5,
    title: "Wisdom Path",
    categories: ["wisdom"],
    description: "A 6-day plan to gain wisdom through Buddhist teachings.",
    image: "/static/img/plans/meditation.jpeg",
    total_days: 6,
    content: ["Day 1: Introduction.", "Day 2: Study.", "Day 3: Reflect.", "Day 4: Apply.", "Day 5: Share.", "Day 6: Conclude."]
  },
  {
    id: 6,
    title: "Gratitude Practice",
    categories: ["gratitude"],
    description: "A 5-day plan to cultivate gratitude.",
    image: "/static/img/plans/meditation.jpeg",
    total_days: 5,
    content: ["Day 1: Start.", "Day 2: Reflect.", "Day 3: Share.", "Day 4: Deepen.", "Day 5: Conclude."]
  },
  {
    id: 7,
    title: "Finding Peace",
    categories: ["peace"],
    description: "A 4-day plan to find inner peace.",
    image: "/static/img/plans/meditation.jpeg",
    total_days: 4,
    content: ["Day 1: Begin.", "Day 2: Meditate.", "Day 3: Reflect.", "Day 4: Sustain."]
  },
  {
    id: 8,
    title: "Forgiveness Journey",
    categories: ["forgiveness"],
    description: "A 3-day plan to practice forgiveness.",
    image: "/static/img/plans/meditation.jpeg",
    total_days: 3,
    content: ["Day 1: Self-forgiveness.", "Day 2: Forgive others.", "Day 3: Move forward."]
  },
  {
    id: 9,
    title: "Equanimity Practice",
    categories: ["equanimity"],
    description: "A 5-day plan to develop equanimity.",
    image: "/static/img/plans/meditation.jpeg",
    total_days: 5,
    content: ["Day 1: Understand.", "Day 2: Practice.", "Day 3: Reflect.", "Day 4: Deepen.", "Day 5: Conclude."]
  },
  {
    id: 10,
    title: "Meditation Basics",
    categories: ["meditation"],
    description: "A 7-day plan to learn meditation.",
    image: "/static/img/plans/meditation.jpeg",
    total_days: 7,
    content: ["Day 1: Start.", "Day 2: Focus.", "Day 3: Breathe.", "Day 4: Observe.", "Day 5: Deepen.", "Day 6: Reflect.", "Day 7: Conclude."]
  }
];

const Plans = ({ multiPanel, toggleSignUpModal, initialWidth }) => {
  const [plans, setPlans] = useState(MOCK_PLANS);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

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

  return (
    <Router basename="/plans">
      <div className="readerNavMenu plansPage sans-serif">
        <div className="content">
          <div className="contentInnerr">
            <Switch>
              <Route
                exact
                path="/"
                render={() => (
                  <>
                    {/* Search Bar */}
                    <div className="searchBarContainer">
                      <div className="searchBarWrapper">
                        <span className="searchIcon">🔍</span>
                        <input
                          type="text"
                          placeholder="Search plans..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="searchInput"
                        />
                      </div>
                    </div>

                    {/* Categories */}
                    <div className="plansCategoriesHeader">
                      <h2>Explore by Category</h2>
                    </div>
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
                      <Link to="/all" className="viewAllLink">View all plans</Link>
                    </div>
                    <div className="plansList">
                      {filteredPlans.length > 0 ? (
                        filteredPlans.map(plan => (
                          <div key={plan.id} className="planCard">
                            <Link to={`/${plan.id}`} className="planImageWrapper">
                              <img src={plan.image} alt={plan.title} className="planImage" />
                              <div className="planCategories">
                                {plan.categories.map((category, index) => (
                                  <span key={index} className="planCategory">
                                    <InterfaceText>{category.charAt(0).toUpperCase() + category.slice(1)}</InterfaceText>
                                    {index < plan.categories.length - 1 && <span className="categorySeparator"> • </span>}
                                  </span>
                                ))}
                                <span className="categoryCount">+{plan.categories.length - 2 > 0 ? plan.categories.length - 2 : 1}</span>
                              </div>
                            </Link>
                            <h3 className="planTitle">
                              <Link to={`/${plan.id}`}>
                                <InterfaceText>{plan.title}</InterfaceText>
                              </Link>
                            </h3>
                            <div className="planFooter">
                              <span className="planDuration">{plan.total_days} days</span>
                              <Link to={`/${plan.id}`} className="readMoreLink">Read more</Link>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p>No plans found.</p>
                      )}
                    </div>
                  </>
                )}
              />
              {/* Plan Detail Route */}
              <Route
                path="/:planId"
                exact
                render={() => <PlanDetail plans={plans} />}
              />
              {/* Placeholder route for progression page */}
              <Route path="/:planId/progress" render={() => <div>Plan Progression Page (To be implemented)</div>} />
              <Route path="/all" render={() => <div>All Plans Page (To be implemented)</div>} />
            </Switch>
          </div>
        </div>
      </div>
    </Router>
  );
};

Plans.propTypes = {
  multiPanel: PropTypes.bool.isRequired,
  toggleSignUpModal: PropTypes.func.isRequired,
  initialWidth: PropTypes.number.isRequired,
};

export default Plans;