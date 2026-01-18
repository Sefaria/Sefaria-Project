import React from "react";
import { NBox } from "@static/js/Misc.jsx";

if (typeof Array.prototype.pad !== "function") {
  Object.defineProperty(Array.prototype, "pad", {
    value: function pad(size, filler) {
      const copy = this.slice();
      while (copy.length < size) {
        copy.push(filler);
      }
      return copy;
    },
  });
}

const makeCard = (label) => (
  <div
    style={{
      borderRadius: 6,
      padding: 12,
      border: "1px solid var(--color-gray-4)",
      background: "var(--color-gray-1)",
      textAlign: "center",
      fontWeight: 600,
    }}
  >
    {label}
  </div>
);

const meta = {
  title: "Misc/NBox",
  component: NBox,
  parameters: {
    layout: "padded",
  },
  argTypes: {
    n: {
      control: { type: "number", min: 1, max: 6 },
      description: "Number of columns per row",
    },
    stretch: {
      control: "boolean",
      description: "Whether to stretch the final row to fill empty columns",
    },
    gap: {
      control: "number",
      description: "Gap (px) between grid items",
    },
  },
  args: {
    n: 3,
    stretch: false,
    gap: 12,
  },
};

export default meta;

export const Default = {
  args: {
    content: [
      makeCard("Genesis"),
      makeCard("Exodus"),
      makeCard("Leviticus"),
      makeCard("Numbers"),
      makeCard("Deuteronomy"),
      makeCard("Joshua"),
      makeCard("Judges"),
    ],
  },
};

export const StretchRow = {
  args: {
    content: [
      makeCard("Morning"),
      makeCard("Afternoon"),
      makeCard("Evening"),
    ],
    stretch: true,
  },
};
