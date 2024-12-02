import React from 'react';
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


export const TopicSalad = ({ numLines, salad, renderItem }) => {

  return (
      <div className='topic-salad'>
                  <WordSalad renderItem={renderSaladItem}
                       numLines={5}
                       salad={exampleItems}/>
      </div>
  );
};