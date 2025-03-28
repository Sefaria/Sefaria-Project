import React from 'react';
import PropTypes from 'prop-types';
import { useParams, Link } from 'react-router-dom';
import { InterfaceText } from './Misc';
import '../css/plans.css';

const PlanDetail = ({ plans }) => {
  const { planId } = useParams(); // Get the planId from the URL
  const plan = plans.find(p => p.id === parseInt(planId));

  if (!plan) {
    return <div>Plan not found.</div>;
  }

  return (
    <div className="planDetail">
      <div className="planDetailBackLink">
        <Link to="/plans" className="backLink">
          <span className="backArrow">←</span> Back to all plans
        </Link>
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
            <Link to={`/${plan.id}/progress`} className="startPlanButton">
              <InterfaceText>Start the Plan</InterfaceText>
            </Link>
          </div>
        </div>
      </div>
      <div className="planDetailContent">
        <h2>What You’ll Learn</h2>
        <p className="planDetailLearnDescription">
          This {plan.total_days}-day journey will guide you through daily teachings and practices based on Buddhist principles. Each day builds upon the last, providing you with insights and practical techniques to apply in your everyday life, and wisdom, developing skills that support your well-being and spiritual growth. Through this plan, you’ll cultivate greater awareness, compassion, and wisdom, developing skills that support your well-being and spiritual growth. The plan is designed to be accessible to practitioners of all levels, whether you’re new to Buddhist teachings or have an established practice.
        </p>
      </div>
    </div>
  );
};

PlanDetail.propTypes = {
  plans: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.number.isRequired,
      title: PropTypes.string.isRequired,
      categories: PropTypes.arrayOf(PropTypes.string).isRequired,
      description: PropTypes.string.isRequired,
      image: PropTypes.string.isRequired,
      total_days: PropTypes.number.isRequired,
      content: PropTypes.arrayOf(PropTypes.string).isRequired,
    })
  ).isRequired,
};

export default PlanDetail;