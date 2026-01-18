import React from "react";
import { LoadingMessage, LoadingRing } from "@static/js/Misc.jsx";

const meta = {
  title: "Misc/Loading",
  component: LoadingMessage,
  parameters: {
    layout: "centered",
  },
  argTypes: {
    message: {
      control: "text",
      description: "English loading copy",
    },
    heMessage: {
      control: "text",
      description: "Hebrew loading copy",
    },
    className: {
      control: "text",
      description: "Additional class names appended to the root",
    },
  },
  args: {
    message: "Loading…",
    heMessage: "טוען מידע…",
  },
};

export default meta;

export const Default = {};

export const CustomCopy = {
  args: {
    message: "Fetching latest sources…",
    heMessage: "מביא מקורות מעודכנים…",
  },
};

export const WithRing = {
  render: (args) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, alignItems: "center" }}>
      <LoadingRing />
      <LoadingMessage {...args} />
    </div>
  ),
};

