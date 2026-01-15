import React, { useState } from "react";
import { MenuButton, SearchButton, CloseButton } from "@static/js/Misc.jsx";

const meta = {
  title: "Misc/HeaderButtons",
  parameters: {
    layout: "centered",
  },
};

export default meta;

export const ButtonsDemo = {
  render: () => {
    const [message, setMessage] = useState("Click a button to see its action.");

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 24, alignItems: "center" }}>
        <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
          <MenuButton onClick={() => setMessage("Menu button pressed")} />
          <SearchButton onClick={() => setMessage("Search button pressed")} />
          <CloseButton
            icon="circledX"
            onClick={() => setMessage("Close button pressed")}
            altText="Close panel"
          />
        </div>
        <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>{message}</p>
      </div>
    );
  },
};

