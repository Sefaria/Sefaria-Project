import React, { useEffect, useState } from "react";
import { TextSegment } from "@static/js/TextRange.jsx";
import { ReaderPanelContext } from "@static/js/context";

const meta = {
  title: "Content/TextSegment",
  component: TextSegment,
  parameters: {
    layout: "padded",
  },
  argTypes: {
    highlight: {
      control: "boolean",
      description: "Apply highlight state to segment",
    },
    showHighlight: {
      control: "boolean",
      description: "Show highlight background when `highlight` is true",
    },
    showLinkCount: {
      control: "boolean",
      description: "Render the link count indicator",
    },
    segmentNumber: {
      control: "number",
      description: "Segment number displayed in the gutter",
    },
  },
  args: {
    sref: "Genesis 1:1",
    he: "בְּרֵאשִׁית בָּרָא אֱלֹהִים אֵת הַשָּׁמַיִם וְאֵת הָאָרֶץ",
    en: "In the beginning God created the heaven and the earth.",
    primaryDirection: "rtl",
    translationDirection: "ltr",
    segmentNumber: 1,
    showLinkCount: true,
    linkCount: 5,
    highlight: false,
    showHighlight: true,
  },
};

export default meta;

const ensureSefariaUtilities = () => {
  if (typeof globalThis === "undefined") {
    return;
  }
  const Sefaria = globalThis.Sefaria || {};
  Sefaria.hebrew = Sefaria.hebrew || {};
  Sefaria.hebrew.encodeHebrewNumeral =
    Sefaria.hebrew.encodeHebrewNumeral || ((n) => n);
  Sefaria.track = Sefaria.track || { event: () => {} };
  Sefaria.parseRef = Sefaria.parseRef || (() => ({ index: "Genesis" }));
  Sefaria.humanRef = Sefaria.humanRef || ((ref) => ref);
  Sefaria.util = Sefaria.util || {
    selectElementContents: () => {},
  };
  Sefaria.toggleSavedItem = Sefaria.toggleSavedItem || (() => Promise.resolve());
  Sefaria.getSavedItem = Sefaria.getSavedItem || (() => false);
  globalThis.Sefaria = Sefaria;
};

export const Default = {
  render: (args) => {
    ensureSefariaUtilities();

    return (
      <ReaderPanelContext.Provider value={{ panelMode: "Text", language: "bilingual" }}>
        <TextSegment {...args} />
      </ReaderPanelContext.Provider>
    );
  },
};

export const WithHighlight = {
  render: (args) => {
    ensureSefariaUtilities();

    return (
      <ReaderPanelContext.Provider value={{ panelMode: "Text", language: "bilingual" }}>
        <TextSegment {...args} highlight showHighlight />
      </ReaderPanelContext.Provider>
    );
  },
};

export const ConnectionsMode = {
  render: (args) => {
    ensureSefariaUtilities();

    const [language, setLanguage] = useState("hebrew");

    return (
      <ReaderPanelContext.Provider value={{ panelMode: "Connections", language }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setLanguage("hebrew")}>Connections: Hebrew</button>
            <button onClick={() => setLanguage("english")}>Connections: English</button>
          </div>
          <TextSegment
            {...args}
            primaryDirection="rtl"
            translationDirection="ltr"
            onNamedEntityClick={() => {}}
            onCitationClick={() => {}}
          />
        </div>
      </ReaderPanelContext.Provider>
    );
  },
  args: {
    showLinkCount: false,
  },
};
