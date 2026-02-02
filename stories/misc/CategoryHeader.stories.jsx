import React from "react";
import { CategoryHeader } from "@static/js/Misc.jsx";
import { InterfaceText } from "@static/js/Misc.jsx";

const meta = {
  title: "Misc/CategoryHeader",
  component: CategoryHeader,
  parameters: {
    layout: "padded",
  },
  argTypes: {
    type: {
      control: { type: "inline-radio" },
      options: ["cats", "books", "topics"],
      description: "Admin toggle group type",
    },
  },
  args: {
    type: "cats",
    data: ["Tanakh", "Torah"],
  },
};

export default meta;

export const Default = {
  render: (args) => {
    if (typeof globalThis !== "undefined" && globalThis.Sefaria) {
      globalThis.Sefaria.is_moderator = false;
    }

    return (
      <CategoryHeader {...args}>
        <h2 style={{ margin: 0 }}>
          <InterfaceText>Tanakh</InterfaceText>
        </h2>
      </CategoryHeader>
    );
  },
};

