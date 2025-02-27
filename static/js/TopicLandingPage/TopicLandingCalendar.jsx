import React from 'react';
import {InterfaceText} from "../Misc";
import {Card} from "../common/Card";


export const TopicLandingCalendar = ({ header, title, description, link, children }) => {
  return (
    <div className="topic-landing-calendar">
      <div className="calendar-header">
          {header}
      </div>
        <span data-anl-link_type="topic">
          <Card
            cardTitleHref={link}
            cardTitle={title}
            cardText={description}
            analyticsEventName = "navto_topic"
          />
        </span>
      {children && <div className="calendar-children">{children}</div>}
    </div>
  );
};