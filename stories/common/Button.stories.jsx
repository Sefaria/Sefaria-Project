import React from "react";
import Button from "@static/js/common/Button.jsx";

const meta = {
  title: "Common/Button",
  component: Button,
  parameters: {
    layout: "centered",
  },
  argTypes: {
    variant: {
      control: "text",
      description: "CSS variant class applied to the button",
    },
    size: {
      control: "radio",
      options: ["", "large", "small", "fullwidth"],
      description: "Optional size modifier",
    },
    icon: {
      control: "text",
      description: "Icon name (without .svg extension)",
    },
    disabled: {
      control: "boolean",
    },
    href: {
      control: "text",
      description: "When provided, renders as an anchor element",
    },
    children: {
      control: "text",
      description: "Content displayed inside the button",
    },
  },
  args: {
    variant: "sefaria-common-button",
    size: "",
    disabled: false,
    children: "Click Me",
  },
};

export default meta;

export const Primary = {
  args: {
    onClick: () => alert("Primary button clicked"),
  },
};

export const Secondary = {
  args: {
    variant: "sefaria-common-button secondary",
    children: "Secondary",
  },
};

export const WithIcon = {
  args: {
    icon: "search",
    alt: "Search",
    children: "Search",
  },
};

export const Disabled = {
  args: {
    disabled: true,
    children: "Disabled",
  },
};

export const AsLink = {
  args: {
    href: "https://www.sefaria.org",
    children: "Go to Sefaria",
    targetModule: "link",
  },
};
