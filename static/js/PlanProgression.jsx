import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
// import './PlanProgression.css'; // Make sure to link the updated CSS file

const MOCK_PROGRESSION_DATA = {
  id: 1,
  title: "Mindful Breathing",
  total_days: 7,
  current_day: 1,
  days: [
    { day: 1, title: "Day 1", content: "Begin by finding a comfortable seated position. Close your eyes gently and bring attention to your natural breathing pattern. Notice the sensation of air entering and leaving your nostrils. Observe without judgment for 5-10 minutes." },
    { day: 2, title: "Day 2", content: "Today we'll focus on body awareness. Start with three deep breaths, then scan your body from head to toe, noticing any sensations without judgment." },
    { day: 3, title: "Day 3", content: "Practice counting your breaths. Inhale (1), exhale (2), up to 10, then start again. When your mind wanders, gently return to counting." },
    { day: 4, title: "Day 4", content: "Throughout your day, take three mindful pauses. Stop whatever you're doing and take three conscious breaths before continuing." },
    { day: 5, title: "Day 5", content: "Extend your practice to 15-20 minutes today. Notice how your awareness develops with longer sessions." },
    { day: 6, title: "Day 6", content: "Practice mindful listening today. When conversing, give your full attention to the speaker without planning your response." },
    { day: 7, title: "Day 7", content: "Reflect on your week of practice. How has your awareness changed? Set intentions for continuing your practice." }
  ]
};

const PlanProgression = () => {
  const { planId } = useParams();
  const [currentDay, setCurrentDay] = useState(1);
  const plan = MOCK_PROGRESSION_DATA;
  const dayData = plan.days.find(d => d.day === currentDay);

  const handlePrevDay = () => {
    if (currentDay > 1) setCurrentDay(currentDay - 1);
  };

  const handleNextDay = () => {
    if (currentDay < plan.total_days) setCurrentDay(currentDay + 1);
  };

  const handleDaySelect = (day) => {
    setCurrentDay(day);
  };

  return (
    <div className="plan-container">
      <Link to={`/plans/${planId}`} className="back-link">← Back to plan</Link>

      {/* Header Image */}
      <div className="header-image">
        <h1 className="title">{plan.title}</h1>
      </div>

      {/* Day Navigation */}
      <div className="day-navigation">
        {plan.days.map((day) => (
          <button
            key={day.day}
            className={`day-dot ${currentDay === day.day ? 'active' : ''}`}
            onClick={() => handleDaySelect(day.day)}
          >
            {day.day}
          </button>
        ))}
      </div>

      {/* Day Content */}
      <h2 className="day-title">{dayData.title}</h2>
      <p className="day-text">{dayData.content}</p>

      {/* Navigation Buttons */}
      <div className="nav-buttons">
        <button className="nav-button prev-button" onClick={handlePrevDay} disabled={currentDay === 1}>
          &lt; Previous Day
        </button>
        <button className="nav-button next-button" onClick={handleNextDay} disabled={currentDay === plan.total_days}>
          Next Day &gt;
        </button>
      </div>
    </div>
  );
};

export default PlanProgression;
