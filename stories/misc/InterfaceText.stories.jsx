import React from "react";
import {
  InterfaceText,
  EnglishText,
  HebrewText,
} from "@static/js/Misc.jsx";

const meta = {
  title: "Misc/InterfaceText",
  component: InterfaceText,
  parameters: {
    layout: "centered",
  },
  argTypes: {
    text: {
      control: "object",
      description: "Bilingual payload passed through the `text` prop",
    },
    markdown: {
      control: "object",
      description: "Bilingual payload rendered as Markdown",
    },
    html: {
      control: "object",
      description: "Bilingual payload rendered using `dangerouslySetInnerHTML`",
    },
    children: {
      control: false,
      description:
        "Optional JSX children. Commonly a mix of <EnglishText> and <HebrewText>",
    },
  },
  args: {
    text: {
      en: "Toggle the globe icon in the toolbar to switch languages.",
      he: "לחצו על סמל הגלובוס בסרגל הכלים כדי להחליף שפות.",
    },
  },
};

export default meta;

export const TextProp = {};

export const WithLanguageChildren = {
  render: () => (
    <InterfaceText>
      <EnglishText>
        Supply per-language children for blocks that include markup.
      </EnglishText>
      <HebrewText>העבירו תוכן שונה לכל שפה לפי הצורך.</HebrewText>
    </InterfaceText>
  ),
};

export const Markdown = {
  args: {
    text: undefined,
    markdown: {
      en: "**Markdown** support lets you emphasize or link [content](https://www.sefaria.org).",
      he: "**Markdown** מאפשר הדגשה או קישור [לתוכן](https://www.sefaria.org).",
    },
  },
};

export const Html = {
  args: {
    text: undefined,
    html: {
      en: "<span style='color: var(--sefaria-blue)'>Trusted HTML</span> is rendered with `dangerouslySetInnerHTML`.",
      he: "<span style='color: var(--sefaria-blue)'>HTML מאושר</span> מוצג באמצעות `dangerouslySetInnerHTML`.",
    },
  },
};

