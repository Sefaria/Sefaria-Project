import {
  IntText,
  NBox,
} from './Misc';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes  from 'prop-types';
import classNames  from 'classnames';
import Sefaria  from './sefaria/sefaria';
import $  from './sefaria/sefariaJquery';
import MobileHeader from './MobileHeader';
import NavSidebar from './NavSidebar';
import Footer  from './Footer';
import Component from 'react-class';


const CalendarsPage = ({multiPanel}) => {

  const initialWidth = multiPanel ? 1000 : 500; // Assume we're in a small panel if we're hiding the nav header
  const [width, setWidth] = useState(initialWidth);

  const ref = useRef(null);
  useEffect(() => {
    deriveAndSetWidth();
    window.addEventListener("resize", deriveAndSetWidth);
    return () => {
        window.removeEventListener("resize", deriveAndSetWidth);
    }
  }, []);

  const deriveAndSetWidth = () => setWidth(ref.current ? ref.current.offsetWidth : initialWidth);


  let calendarListings = Sefaria.calendars.map(calendar => {
    const style = {"borderColor": Sefaria.palette.categoryColor(calendar.category)};
    return <div className="navBlock withColorLine" style={style}>
            <a href={`/${calendar.url}`} className="navBlockTitle">
              <span className="en">{calendar.title.en}</span>
              <span className="he">{calendar.title.he}</span>
            </a>
            <div className="calendarRef">
              <img src="/static/img/book-icon-black.svg" className="navSidebarIcon" alt="book icon" />
              <a href={`/${calendar.url}`} className="">
                <span className="en">{calendar.displayValue.en}</span>
                <span className="he">{calendar.displayValue.he}</span>
              </a> 
            </div>          
            { calendar.description ?
            <div className="navBlockDescription">
              <span className="en">{calendar.description.en}</span>
              <span className="he">{calendar.description.he}</span>
            </div>
            : null}
          </div>
  });
  calendarListings = (<div className="readerNavCategories"><NBox content={calendarListings} n={2} /></div>);

  const sidebarModules = [
    {type: "AboutStudySchedules"},
    {type: "StayConnected"},
    {type: "SupportSefaria"},
  ];

  const classes = classNames({readerNavMenu:1, noHeader: 1 });
  const contentClasses = classNames({content: 1, hasFooter: 1});

  return(<div ref={ref} className={classes} key="0">
          <div className={contentClasses}>
            <div className="sidebarLayout">
              <div className="contentInner">
                <h1><IntText>Study Schedules</IntText></h1>
                { calendarListings }
              </div>
              <NavSidebar modules={sidebarModules} />
            </div>
            <Footer />
          </div>
        </div>);
};


const formatCalendars = () => {


};

const calendarDescriptions = {
  "Haftarah": {
    en: "The portion from Prophets (a section of the Bible) read on any given week, based on its thematic connection to the weekly Torah portion.",
    he: ""
  },
  "Daf Yomi": {
    en: "A study program that covers a page of Talmud a day. In this way, the entire Talmud is completed in about seven and a half years.",
    he: ""
  },
  "929": {
    en: "A study program in which participants study five of the Bible’s 929 chapters a week, completing it in about three and a half years.",
    he: ""
  },
  "Daily Mishnah": {
    en: "A program of daily study in which participants study two Mishnahs (teachings) each day in order to finish the entire Mishnah in six years.",
    he: ""
  },
  "Daily Rambam": {
    en: "A study program that divides Maimonides’ Mishneh Torah legal code into daily units, to complete the whole work in one or three years.",
    he: ""
  },
  "Daf Yomi": {
    en: "",
    he: ""
  },
  "Daf Yomi": {
    en: "",
    he: ""
  },
  "Daf Yomi": {
    en: "",
    he: ""
  },
}


Haftarah


The Haftarah is the portion from Prophets (a section of the Bible) read in synagogues on a given week, based on its thematic tie to the weekly portion. Sometimes the connection is obvious and sometimes more subtle. Some weeks, there are different traditions over what is to be read.

Daf Yomi


Daf Yomi (the Daily Page) is a study program that covers a page of Talmud a day. This way, the entire Talmud is completed in seven and a half years, producing familiarity with most of the sources of Jewish law and ethics. Begun in 1923, it has many thousands of followers worldwide.

929


929 is a study program wherein participants study five out of the Bible’s 929 chapters a week, finishing the entire Bible in about three and a half years. The program allows its participants to get a sweeping view of the Bible, giving the stories of the Torah additional context. 

Daily Mishnah


Daily Mishnah is a study program that has been with us since the middle of the previous century. Participants study two Mishnahs (teachings) each day in order to finish the entire Mishnah in six years, giving them an overview of classical Jewish law.

Daily Rambam


Sponsored and initiated by Chabad Lubavitch, the Daily Rambam (Maimonides) study schedule is divided into one year and three year tracks. Participants thus complete Maimondes’ Mishneh Torah, the only major code of Jewish law that also includes laws not currently practiced.  

Daf a Week

A study program  that covers a page of Talmud a week. By going at a slower pace, it facilitates greater mastery and retention.

Daf a Week is a program wherein participants study a page of Talmud a week. While the whole cycle takes 52 years, the goal is not completion but consistency and mastery. Hence it is designed for those who prefer to study Talmud in depth, as usually done in a yeshiva.

Halakhah Yomit

A four year daily study program in which participants study central legal texts that cover most of the daily and yearly rituals. 

Founded in the 1950s to remember victims of the Holocaust, Halakhah Yomit (the Daily Law) is a four year daily study program in which participants study central legal texts that cover most of the daily and yearly rituals. Participants cover from three to five teachings each day.



export default CalendarsPage;