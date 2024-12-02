import React from 'react';
import {useEffect, useState} from "react";
import {WordSalad} from "./WordSalad";
import Sefaria from "../sefaria/sefaria";

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

const getRandomSaladItems = async () => {
    const topics = await Sefaria.getTopicsByPool('general_en', 50);
    const saladItems = topics.map(topic=>({slug: topic.slugs, text: topic.primaryTitle.en}))
    return saladItems;
}


export const TopicSalad = () => {

    const [salad, setSalad] = useState([]);

    useEffect(async () => {
        const saladItems = await getRandomSaladItems();
        setSalad(saladItems);
    }, []);

    return (
      <div className='topic-salad'>
                  <WordSalad renderItem={renderSaladItem}
                       numLines={5}
                       salad={salad}/>
      </div>
  );
};