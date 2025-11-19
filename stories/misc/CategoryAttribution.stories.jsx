import React from "react";
import { CategoryAttribution } from "@static/js/Misc.jsx";

const meta = {
  title: "Misc/CategoryAttribution",
  component: CategoryAttribution,
  parameters: {
    layout: "padded",
  },
  argTypes: {
    categories: {
      control: "object",
      description: "Category string array used to derive attribution metadata",
    },
    linked: {
      control: "boolean",
      description: "Whether to render the attribution as a link",
    },
    asEdition: {
      control: "boolean",
      description: "Switch copy to the edition-centric variant",
    },
  },
  args: {
    categories: ["Tanakh", "Torah"],
    linked: true,
    asEdition: false,
  },
};

export default meta;

export const Default = {
  render: (args) => {
    if (typeof globalThis !== "undefined") {
      globalThis.Sefaria = globalThis.Sefaria || {};
      globalThis.Sefaria.categoryAttribution = () => ({
        english: "Courtesy of the Tanakh Library",
        hebrew: "באדיבות ספריית התנ\"ך",
        englishAsEdition: "Edition prepared by the Tanakh Library",
        hebrewAsEdition: "מהדורה בעריכת ספריית התנ\"ך",
        link: "https://www.sefaria.org",
      });
    }

    return <CategoryAttribution {...args} />;
  },
};

export const AsEdition = {
  render: (args) => {
    if (typeof globalThis !== "undefined") {
      globalThis.Sefaria = globalThis.Sefaria || {};
      globalThis.Sefaria.categoryAttribution = () => ({
        english: "Sourced from the Judaic Heritage Trust",
        hebrew: "מסופק על ידי קרן המורשת היהודית",
        englishAsEdition: "Critical edition by the Judaic Heritage Trust",
        hebrewAsEdition: "מהדורה מדעית של קרן המורשת היהודית",
        link: "https://www.sefaria.org/sheets",
      });
    }

    return <CategoryAttribution {...args} asEdition linked />;
  },
  args: {
    categories: ["Mishnah", "Zeraim"],
  },
};
