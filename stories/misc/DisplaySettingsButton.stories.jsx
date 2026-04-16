import React, { useState } from "react";
import { DisplaySettingsButton } from "@static/js/Misc.jsx";

const meta = {
  title: "Misc/DisplaySettingsButton",
  component: DisplaySettingsButton,
  parameters: {
    layout: "centered",
  },
  argTypes: {
    placeholder: {
      control: "boolean",
      description: "Toggle the placeholder state (hides the button)",
    },
  },
  args: {
    placeholder: false,
  },
};

export default meta;

export const Default = {
  render: (args) => {
    const [isOpen, setIsOpen] = useState(false);

    const handleToggle = () => {
      setIsOpen((prev) => !prev);
    };

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "center" }}>
        <DisplaySettingsButton {...args} onClick={handleToggle} />
        <div
          style={{
            minHeight: 48,
            minWidth: 280,
            borderRadius: 8,
            padding: 16,
            border: "1px solid var(--color-gray-4)",
            background: "var(--color-gray-0)",
            color: "var(--color-text-secondary)",
          }}
        >
          {isOpen ? "Display settings panel would open here." : "Click the button to toggle the panel."}
        </div>
      </div>
    );
  },
};

