import React from "react";
import { CategoryColorLine } from "@static/js/Misc.jsx";

const meta = {
  title: "Misc/CategoryColorLine",
  component: CategoryColorLine,
  parameters: {
    layout: "padded",
  },
  argTypes: {
    category: {
      control: "text",
      description: "Name used to fetch the category color from the palette",
    },
  },
  args: {
    category: "Tanakh",
  },
};

export default meta;

export const Default = {
  args: {},
};

