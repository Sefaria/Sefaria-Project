import {Card} from "./Card";
import React from "react";

export const TopicTOCCard = ({topic, setTopic, setNavTopic}) => {
  /*
    * Card for a topic in a Topic Category page.  `topic` is an object with a slug, en, he, and optionally description or children.
   */
  const openTopic = e => {
    e.preventDefault();
    children ? setNavTopic(slug, {en, he}) : setTopic(slug, {en, he});
  }

  const { slug, children} = topic;
  const description = children ? topic.categoryDescription : topic.description;
  let {en, he} = topic;
  en = en.replace(/^Parashat /, "");
  he = he.replace(/^פרשת /, "");
  const href = `/topics/${children ? 'category/' : ''}${slug}`;

  return <Card cardTitleHref={href}
               cardTitle={{en, he}}
               cardText={description}
               analyticsEventName="navto_topic:click"
               analyticsLinkType={children ? "category" : "topic"}
               oncardTitleClick={openTopic}/>;
}