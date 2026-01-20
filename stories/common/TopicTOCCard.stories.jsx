import React from "react";
import { TopicTOCCard } from "@static/js/common/TopicTOCCard.jsx";

const topic = {
  slug: "shabbat",
  primaryTitle: {
    en: "Shabbat",
    he: "שבת",
  },
  description: {
    en: "Explore sources, sheets, and explanations covering the weekly day of rest.",
    he: "למדו על מקורות, דפים והסברים הקשורים ליום המנוחה השבועי.",
  },
};

const categoryTopic = {
  slug: "holidays",
  primaryTitle: {
    en: "Jewish Holidays",
    he: "חגים יהודיים",
  },
  categoryDescription: {
    en: "Browse holiday topics, their customs, and key texts.",
    he: "דפדפו בנושאי החגים, מנהגיהם ומקורות מרכזיים.",
  },
  children: [
    { slug: "rosh-hashanah", primaryTitle: { en: "Rosh Hashanah", he: "ראש השנה" } },
    { slug: "passover", primaryTitle: { en: "Passover", he: "פסח" } },
  ],
};

const meta = {
  title: "Common/TopicTOCCard",
  component: TopicTOCCard,
  parameters: {
    layout: "centered",
  },
  argTypes: {
    showDescription: {
      control: "boolean",
      description: "Toggle description text visibility",
    },
  },
  args: {
    topic,
    setTopic: () => {},
    setNavTopic: () => {},
    showDescription: true,
  },
};

export default meta;

export const TopicCard = {};

export const CategoryCard = {
  args: {
    topic: categoryTopic,
  },
};

export const WithoutDescription = {
  args: {
    showDescription: false,
  },
};
