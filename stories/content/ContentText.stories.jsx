import React, { useEffect, useState } from "react";
import { ContentText } from "@static/js/ContentText.jsx";

const ensureSefariaHelpers = () => {
  if (typeof globalThis === "undefined") {
    return;
  }
  const Sefaria = globalThis.Sefaria || {};
  Sefaria.isFullSegmentImage =
    Sefaria.isFullSegmentImage ||
    ((text) => typeof text === "string" && /<img\s/i.test(text ?? ""));
  Sefaria.hebrew = Sefaria.hebrew || {};
  Sefaria.hebrew.encodeHebrewNumeral =
    Sefaria.hebrew.encodeHebrewNumeral || ((n) => n);
  globalThis.Sefaria = Sefaria;
};

ensureSefariaHelpers();

const meta = {
  title: "Content/ContentText",
  component: ContentText,
  parameters: {
    layout: "padded",
  },
  argTypes: {
    defaultToInterfaceOnBilingual: {
      control: "boolean",
      description: "When true, forces bilingual content to respect interface language",
    },
    overrideLanguage: {
      control: "select",
      options: [null, "english", "hebrew"],
      description: "Force a specific content language",
    },
  },
  args: {
    text: {
      en: "Study Torah sources alongside translations and community-contributed insights.",
      he: "למדו מקורות תורה לצד תרגומים ותובנות מהקהילה.",
    },
    defaultToInterfaceOnBilingual: false,
  },
};

export default meta;

export const Text = {};

export const Markdown = {
  args: {
    markdown: {
      en: "**Bold insights** and _contextual_ notes stay preserved when using markdown content.",
      he: "**הדגשות** והערות _הקשריות_ נשמרות גם בתוכן מרובה־שפות.",
    },
    text: undefined,
  },
};

export const Html = {
  args: {
    html: {
      en: "<p><strong>Trusted HTML</strong> can render callouts or inline links like <a href='https://www.sefaria.org'>Sefaria.org</a>.</p>",
      he: "<p><strong>HTML מאושר</strong> מאפשר הדגשות או קישורים כגון <a href='https://www.sefaria.org'>Sefaria.org</a>.</p>",
    },
    text: undefined,
  },
};

export const BilingualToggle = {
  render: (args) => {
    ensureSefariaHelpers();
    const [interfaceLang, setInterfaceLang] = useState("english");

    useEffect(() => {
      if (typeof globalThis !== "undefined") {
        globalThis.Sefaria = globalThis.Sefaria || {};
        globalThis.Sefaria.interfaceLang = interfaceLang;
      }
    }, [interfaceLang]);

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", gap: 12 }}>
          <button onClick={() => setInterfaceLang("english")}>Interface: English</button>
          <button onClick={() => setInterfaceLang("hebrew")}>Interface: Hebrew</button>
        </div>
        <ContentText
          {...args}
          text={{
            en: "Interface language controls which side appears first in bilingual mode.",
            he: "שפת הממשק קובעת איזו שפה תוצג ראשונה במצב דו-לשוני.",
          }}
        />
      </div>
    );
  },
};
