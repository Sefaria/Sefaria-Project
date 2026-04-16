import React, { useState } from "react";
import { ToolTipped } from "@static/js/Misc.jsx";

const meta = {
  title: "Misc/ToolTipped",
  component: ToolTipped,
  parameters: {
    layout: "centered",
  },
  argTypes: {
    altText: {
      control: "text",
      description: "Accessible label for the interactive wrapper",
    },
    classes: {
      control: "text",
      description: "Class names applied to the trigger element",
    },
  },
  args: {
    altText: "Toggle helper",
    classes: "tooltip-toggle storybook-tool-tipped",
  },
};

export default meta;

export const Default = {
  render: (args) => {
    const [clicks, setClicks] = useState(0);

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "center" }}>
        <ToolTipped
          {...args}
          onClick={() => setClicks((prev) => prev + 1)}
          style={{
            borderRadius: "50%",
            width: 48,
            height: 48,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--color-gray-1)",
            border: "1px solid var(--color-gray-4)",
            cursor: "pointer",
          }}
        >
          <span style={{ fontSize: 20, fontWeight: 600 }}>i</span>
        </ToolTipped>
        <p style={{ margin: 0 }}>Clicked {clicks} times.</p>
      </div>
    );
  },
};

