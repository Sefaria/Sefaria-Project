import React from "react";
import { DonateLink } from "../../static/js/Misc.jsx";

const meta = {
  title: "Misc/DonateLink",
  component: DonateLink,
  parameters: {
    layout: "centered",
  },
  args: {
    children: "Support Sefaria",
    source: "storybook",
    classes: "button blue",
  },
};

export default meta;

export const Default = {};

export const DayOfLearning = {
  args: {
    children: "Sponsor a Day of Learning",
    link: "dayOfLearning",
  },
};
