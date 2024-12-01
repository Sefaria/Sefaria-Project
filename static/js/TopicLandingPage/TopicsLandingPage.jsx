import React from 'react';
import {TopicLandingSearch} from "./TopicLandingSearch";
import {WordSalad} from "./WordSalad";


const exampleSlugs = [
  "Potiphar’s wife", "Og", "vines", "diversity", "humanity", "ravens",
  "Terach", "Fast of Gedaliah", "harmful forces", "Purim", "energy",
  "camels", "relationships", "Melchizedek", "prayer", "growth", "Iddo",
  "maror", "Yitro", "menorah", "alacrity", "authority", "Yom Kippur",
  "bal tashchit", "four questions", "Moses and Joseph’s coffin", "fertility",
  "freedom", "the future to come", "Jacob’s dream", "Ezekiel", "social justice",
  "compassion",
    "hate"
]
const exampleItems = exampleSlugs.map(slug => ({text: slug}))

const renderSaladItem = (item) => {
    return <span className="topic-salad-item">{item.text} </span>
}

export const TopicsLandingPage = ({openTopic}) => {
    return (<div className='topic-landing-page-wrapper'>
        <div>Hello, would you like a serving of topics salad?</div>
        <TopicLandingSearch openTopic={openTopic} numOfTopics={5000}/>
            <div className={'topic-salad'}>
            <WordSalad renderItem={renderSaladItem}
                       numLines={5}
                       salad={exampleItems}/>
            </div>
        </div>
    )
};
