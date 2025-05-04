import {Card} from "./Card";
import React from "react";
import Sefaria from "../sefaria/sefaria";

export const TopicTOCCard = ({topic, setTopic, setNavTopic=null, showDescription=true}) => {
  /*
    * Card for a topic in a Topic Category page.  `topic` is an object with a slug, en, he, and optionally description or children.
   */
  const openTopic = e => {
    e.preventDefault();
    children && setNavTopic ? setNavTopic(slug, {en, he}) : setTopic(slug, {en, he});
  }

  const { slug, children} = topic;
  const description = children ? topic.categoryDescription : topic.description;
  let {en, he} = topic;
  en = en.replace(/^Parashat /, "");
  he = he.replace(/^פרשת /, "");
  const href = `/topics/${children ? 'category/' : ''}${slug}`;

  if (!Sefaria.shouldDisplayTopic(topic)) { return null; }
  return <Card cardTitleHref={href}
               cardTitle={{en, he}}
               cardText={showDescription ? description : ""}
               analyticsEventName="navto_topic:click"
               analyticsLinkType={children ? "category" : "topic"}
               oncardTitleClick={openTopic}/>;
}