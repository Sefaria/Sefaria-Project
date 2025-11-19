import React from "react";
import { ResponsiveNBox } from "@static/js/Misc.jsx";

const placeholderCard = (title) => (
  <div
    style={{
      border: "1px solid var(--color-gray-4)",
      borderRadius: 8,
      padding: 16,
      background: "var(--color-white)",
    }}
  >
    <strong>{title}</strong>
    <p style={{ marginTop: 8 }}>Use this layout for card grids that adapt to viewport width.</p>
  </div>
);

const meta = {
  title: "Misc/ResponsiveNBox",
  component: ResponsiveNBox,
  parameters: {
    layout: "padded",
  },
  argTypes: {
    stretch: {
      control: "boolean",
      description: "Whether the final row stretches to fill remaining columns",
    },
    gap: {
      control: "number",
      description: "Gap (px) between cards",
    },
    threshold2: {
      control: "number",
      description: "Viewport width for switching to 2 columns",
    },
    threshold3: {
      control: "number",
      description: "Viewport width for switching to 3 columns",
    },
  },
  args: {
    stretch: false,
    gap: 16,
    threshold2: 600,
    threshold3: 1100,
  },
};

export default meta;

export const Default = {
  args: {
    content: [
      placeholderCard("Sources"),
      placeholderCard("Topics"),
      placeholderCard("Sheets"),
      placeholderCard("Learning Plans"),
      placeholderCard("Random Source"),
      placeholderCard("Community Highlights"),
    ],
    initialWidth: 900,
  },
};

export const StretchFinalRow = {
  args: {
    content: [
      placeholderCard("Article"),
      placeholderCard("Video"),
      placeholderCard("Podcast"),
      placeholderCard("Newsletter"),
    ],
    stretch: true,
    initialWidth: 720,
  },
};

