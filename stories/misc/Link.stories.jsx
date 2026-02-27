import React from "react";
import { Link } from "@static/js/Misc.jsx";

const meta = {
  title: "Misc/Link",
  component: Link,
  parameters: {
    layout: "centered",
  },
  argTypes: {
    href: {
      control: "text",
      description: "Destination URL for the anchor",
    },
    title: {
      control: "text",
      description: "Title attribute applied to the anchor",
    },
    className: {
      control: "text",
      description: "Optional class names",
    },
  },
  args: {
    href: "https://www.sefaria.org",
    title: "Visit Sefaria",
    className: "story-link",
  },
};

export default meta;

export const Default = {
  args: {
    children: "Go to Sefaria",
    onClick: () => {},
  },
};

