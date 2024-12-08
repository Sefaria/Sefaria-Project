import React from 'react';
import {useEffect, useState} from "react";
import {WordSalad} from "../WordSalad";
import Sefaria from "../sefaria/sefaria";
import {InterfaceText} from "../Misc";
import {Card} from "../common/Card";


export const TopicLandingCalendar = ({ header, title, description, link, children }) => {
  return (
    <div className="topic-landing-calendar">
      <div className="calendar-header">
          {header}
      </div>
      <Card
        cardTitleHref={link}
        cardTitle={title}
        cardText={description}
      />
      {children && <div className="calendar-children">{children}</div>}
    </div>
  );
};