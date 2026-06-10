import React from "react";
import { AppStoreButton } from "@static/js/Misc.jsx";

const meta = {
  title: "Misc/AppStoreButton",
  component: AppStoreButton,
  parameters: {
    layout: "centered",
  },
  argTypes: {
    platform: {
      control: {
        type: "inline-radio",
      },
      options: ["ios", "android"],
    },
    href: {
      control: "text",
      description: "Link to the relevant app marketplace",
    },
    altText: {
      control: "text",
      description: "Accessible description for the badge icon",
    },
  },
  args: {
    href: "https://apps.apple.com/us/app/sefaria/id123456789",
    altText: "Download on the App Store",
  },
};

export default meta;

export const IOS = {
  args: {
    platform: "ios",
  },
};

export const Android = {
  args: {
    platform: "android",
    href: "https://play.google.com/store/apps/details?id=org.sefaria",
    altText: "Get it on Google Play",
  },
};

