import React from "react";
import { CommunityPagePreviewControls } from "@static/js/Misc.jsx";

const meta = {
  title: "Misc/CommunityPagePreviewControls",
  component: CommunityPagePreviewControls,
  parameters: {
    layout: "padded",
  },
  argTypes: {
    date: {
      control: "date",
      description: "Community page date being previewed (stored as ISO yyyy-mm-dd)",
    },
  },
  args: {
    date: "2025-03-01",
  },
};

export default meta;

export const Default = {};

