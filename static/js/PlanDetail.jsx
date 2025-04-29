import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { InterfaceText } from './Misc';
// import '../css/plans.css';

const PlanDetail = ({ planId }) => {
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchPlanDetails = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/plans/${planId}`);
        if (!response.ok) {
          throw new Error('Failed to fetch plan details');
        }
        const data = await response.json();
        setPlan(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchPlanDetails();
  }, [planId]);

  if (loading) {
    return <div className="loading">Loading plan details...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  if (!plan) {
    return <div>Plan not found.</div>;
  }

  return (
    <div className="planDetail">
      <div className="planDetailBackLink">
        <a href="/plans" className="backLink">
          <span className="backArrow">←</span> Back to all plans
        </a>
      </div>
      <div className="planDetailHeader">
        <div className="planDetailImageWrapper">
          <img src={plan.image} alt={plan.title} className="planDetailImage" />
          <div className="planDetailCategories">
            {plan.categories.map((category, index) => (
              <span key={index} className="planDetailCategory">
                <InterfaceText>{category.charAt(0).toUpperCase() + category.slice(1)}</InterfaceText>
                {index < plan.categories.length - 1 && <span className="categorySeparator"> • </span>}
              </span>
            ))}
          </div>
        </div>
        <div className="planDetailInfo">
          <h1 className="planDetailTitle">{plan.title}</h1>
          <p className="planDetailDescription">{plan.description}</p>
          <div className="planDetailMeta">
            <span className="planDetailDuration">{plan.total_days} days</span>
          </div>
          <div className="planDetailActions">
            <a href={`/plans/${planId}/progress`} className="startPlanButton">
              <InterfaceText>Start the Plan</InterfaceText>
            </a>
          </div>
        </div>
      </div>
      <div className="planDetailContent">
        <h2>What You'll Learn</h2>
        <p className="planDetailLearnDescription">
          This {plan.total_days}-day journey will guide you through daily teachings and practices based on Buddhist principles. Each day builds upon the last, providing you with insights and practical techniques to apply in your everyday life, and wisdom, developing skills that support your well-being and spiritual growth. Through this plan, you'll cultivate greater awareness, compassion, and wisdom, developing skills that support your well-being and spiritual growth. The plan is designed to be accessible to practitioners of all levels, whether you're new to Buddhist teachings or have an established practice.
        </p>
      </div>
    </div>
  );
};

PlanDetail.propTypes = {};

export default PlanDetail;