import {
  InterfaceText,
  ResponsiveNBox,
} from './Misc';
import React, { useState } from 'react';
import classNames  from 'classnames';
import Sefaria  from './sefaria/sefaria';
import $  from './sefaria/sefariaJquery';
import { NavSidebar, Modules }from './NavSidebar';
import Footer  from './Footer';
import Component from 'react-class';


const CalendarsPage = ({multiPanel, initialWidth}) => {

  const calendars = reformatCalendars();

  const parashaCalendars = ["Parashat Hashavua", "Haftarah (A)", "Haftarah (S)", "Haftarah"];
  const dailyCalendars   = ["Daf Yomi", "929", "Daily Mishnah", "Daily Rambam", "Daily Rambam (3)", "Halakhah Yomit"];
  const weeklyCalendars  = ["Daf a Week"];

  const makeListings = list => calendars.filter(c => list.indexOf(c.title.en) != -1)
                              .map(c => <CalendarListing calendar={c} />);

  const parashaListings = makeListings(parashaCalendars);
  const dailyListings   = makeListings(dailyCalendars);
  const weeklyListings  = makeListings(weeklyCalendars);

  const about = multiPanel ? null :
    <Modules type={"AboutStudySchedules"} />

  const sidebarModules = [
    multiPanel ? {type: "AboutStudySchedules"} : {type: null},
    {type: "StayConnected"},
    {type: "SupportSefaria"},
  ];

  return (
    <div className="readerNavMenu" key="0">
      <div className="content">
        <div className="sidebarLayout">
          <div className="contentInner">
            {about}
            <h2 className="styledH1"><InterfaceText>Weekly Torah Portion</InterfaceText></h2>
            <div className="readerNavCategories">
              <ResponsiveNBox content={parashaListings} initialWidth={initialWidth} />
            </div>
            <h2 className="styledH1"><InterfaceText>Daily Study</InterfaceText></h2>
            <div className="readerNavCategories">
              <ResponsiveNBox content={dailyListings} initialWidth={initialWidth} />
            </div>
            <h2 className="styledH1"><InterfaceText>Weekly Study</InterfaceText></h2>
            <div className="readerNavCategories">
              <ResponsiveNBox content={weeklyListings} initialWidth={initialWidth} />
            </div>
          </div>
          <NavSidebar modules={sidebarModules} />
        </div>
        <Footer />
      </div>
    </div>
  );
};


const CalendarListing = ({calendar}) => {
  const style = {"borderColor": Sefaria.palette.categoryColor(calendar.category)};
  return (
    <div className="navBlock withColorLine" style={style}>
      <a href={`/${calendar.url}`} className="navBlockTitle">
        <InterfaceText text={calendar.displayTitle} />
      </a>
      <div className="calendarRefs">
        {calendar.refs.map(ref => (
        <div className="calendarRef" key={ref.url}>
          <img src="/static/img/book-icon-black.svg" className="navSidebarIcon" alt="book icon" />
          <a href={`/${ref.url}`} className="">
            <InterfaceText text={ref.displayValue} />
          </a>
        </div>
        ))}
      </div>          
      { calendar.description ?
      <div className="navBlockDescription">
        <InterfaceText text={calendar.description} />
      </div>
      : null}
    </div>
  );
};


const reformatCalendars = () => {
  const calendars = Sefaria.util.clone(Sefaria.calendars);
  const mergedCalendars = [];
  calendars.map(cal => {
    let calData = calendarDescriptions[cal.title.en.replace(/ \([AS]\)$/, "")]
    if (!calData) debugger
    if (!cal.description) {
      cal.description = {en: calData.en, he: calData.he};
    }
    if (cal.title.en === "Parashat Hashavua") {
      cal.displayTitle = cal.displayValue;
      cal.displayValue = {en: cal.ref, he: cal.heRef};
    } else {
      cal.displayTitle = Sefaria.util.clone(cal.title);
      if (calData.enDisplayTitle) {
        cal.displayTitle.en = calData.enDisplayTitle;
      }
    }

    let len = mergedCalendars.length;
    if (len && cal.title.en === mergedCalendars[len-1].title.en) {
      mergedCalendars[len-1].refs.push({url: cal.url, displayValue: cal.displayValue});
    } else {
      cal.refs = [{url: cal.url, displayValue: cal.displayValue}];
      mergedCalendars.push(cal);
    }
  });

  return mergedCalendars;
};


const calendarDescriptions = {
  "Parashat Hashavua": {},
  "Haftarah": {
    en: "The portion from Prophets (a section of the Bible) read on any given week, based on its thematic connection to the weekly Torah portion.",
    he: ""
  },
  "Daf Yomi": {
    en: "A study program that covers a page of Talmud a day. In this way, the entire Talmud is completed in about seven and a half years.",
    he: "",
    enDisplayTitle: "Daf Yomi (Talmud)",
  },
  "929": {
    en: "A study program in which participants study five of the Bible’s 929 chapters a week, completing it in about three and a half years.",
    he: "",
    enDisplayTitle: "929 (Tanakh)",
  },
  "Daily Mishnah": {
    en: "A program of daily study in which participants study two Mishnahs (teachings) each day in order to finish the entire Mishnah in six years.",
    he: ""
  },
  "Daily Rambam": {
    en: "A study program that divides Maimonides’ Mishneh Torah legal code into daily units, to complete the whole work in three years.",
    he: ""
  },
  "Daily Rambam (3)": {
    en: "A study program that divides Maimonides’ Mishneh Torah legal code into daily units, to complete the whole work in one year.",
    he: "",
    enDisplayTitle: "Daily Rambam (3 Chapters)",
  },
  "Daf a Week": {
    en: "A study program  that covers a page of Talmud a week. By going at a slower pace, it facilitates greater mastery and retention.",
    he: "",
    enDisplayTitle: "Daf a Week (Talmud)"
  },
  "Halakhah Yomit": {
    en: "A four year daily study program in which participants study central legal texts that cover most of the daily and yearly rituals.",
    he: ""
  },
}


export default CalendarsPage;