import React, { useEffect, useState } from "react";
import { LanguageToggleButton } from "@static/js/Misc.jsx";

const meta = {
  title: "Misc/LanguageToggleButton",
  component: LanguageToggleButton,
  parameters: {
    layout: "centered",
  },
  argTypes: {
    url: {
      control: "text",
      description: "Optional href for the toggle anchor",
    },
  },
};

export default meta;

export const Interactive = {
  render: (args) => {
    const [activeLang, setActiveLang] = useState(args.interfaceLang ?? "english");

    useEffect(() => {
      setActiveLang(args.interfaceLang ?? "english");
    }, [args.interfaceLang]);

    useEffect(() => {
      if (typeof globalThis !== "undefined" && globalThis.Sefaria) {
        globalThis.Sefaria.interfaceLang = activeLang;
      }
    }, [activeLang]);

    const handleToggle = () => {
      setActiveLang((prev) => (prev === "hebrew" ? "english" : "hebrew"));
    };

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "center" }}>
        <p style={{ margin: 0 }}>
          Current interface language: <strong>{activeLang}</strong>
        </p>
        <LanguageToggleButton {...args} toggleLanguage={handleToggle} />
      </div>
    );
  },
  args: {
    url: "#toggle-language",
    interfaceLang: "english",
  },
};
