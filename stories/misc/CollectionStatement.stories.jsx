import React from "react";
import { CollectionStatement } from "@static/js/Misc.jsx";
import { InterfaceText } from "@static/js/Misc.jsx";

const meta = {
  title: "Misc/CollectionStatement",
  component: CollectionStatement,
  parameters: {
    layout: "padded",
  },
  argTypes: {
    name: {
      control: "text",
      description: "Collection display name",
    },
    slug: {
      control: "text",
      description: "Collection slug used to build the link",
    },
    image: {
      control: "text",
      description: "Optional image URL for the collection avatar",
    },
  },
  args: {
    name: "Global Jewish Learning",
    slug: "global-jewish-learning",
    image: "https://www.sefaria.org/static/img/collection-default.png",
  },
};

export default meta;

export const Default = {
  args: {
    children: (
      <InterfaceText>
        Highlighting sheets curated by educators and community leaders across the globe.
      </InterfaceText>
    ),
  },
};

