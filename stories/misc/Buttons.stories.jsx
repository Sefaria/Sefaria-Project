import React from "react";
import {
  SmallBlueButton,
  Arrow as ArrowButton,
} from "@static/js/Misc.jsx";

const meta = {
  title: "Misc/Buttons",
  component: SmallBlueButton,
  parameters: {
    layout: "centered",
  },
};

export default meta;

export const SmallBlue = {
  render: () => (
    <SmallBlueButton
      text="Add source"
      onClick={() => {}}
      tabIndex={0}
    />
  ),
};

export const ArrowNavigation = {
  render: () => (
    <div style={{ display: "flex", gap: 16 }}>
      <ArrowButton
        direction="previous"
        onClick={() => {}}
        altText="Previous item"
      />
      <ArrowButton
        direction="next"
        onClick={() => {}}
        altText="Next item"
      />
    </div>
  ),
};
