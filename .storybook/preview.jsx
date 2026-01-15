import React from "react";
import "@static/css/common.css";
import "@static/css/s2.css";
import {
  ReaderPanelContext,
  AdContext,
  StrapiDataContext,
} from "@static/js/context";
import sefariaStub from "./sefariaStub";

if (typeof globalThis !== "undefined") {
  globalThis.Sefaria = sefariaStub;
  globalThis.sa_event = globalThis.sa_event || (() => {});
  globalThis.gtag = globalThis.gtag || (() => {});
}

const mockStrapiValue = {
  dataFromStrapiHasBeenReceived: true,
  strapiData: {},
  modal: null,
  banner: null,
};

const mockAdContext = {
  feature_name: "storybook",
};

export const globalTypes = {
  interfaceLang: {
    name: "Interface language",
    description: "Toggle between English and Hebrew interface strings",
    defaultValue: "english",
    toolbar: {
      icon: "globe",
      items: [
        { value: "english", title: "English" },
        { value: "hebrew", title: "עברית" },
      ],
    },
  },
};

/** @type { import('@storybook/react-vite').Preview } */
const preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
  decorators: [
    (Story, context) => {
      const interfaceLang = context.globals.interfaceLang;
      sefariaStub.interfaceLang = interfaceLang;
      const readerPanelValue = { language: interfaceLang };
      return (
        <ReaderPanelContext.Provider value={readerPanelValue}>
          <AdContext.Provider value={mockAdContext}>
            <StrapiDataContext.Provider value={mockStrapiValue}>
              <Story />
            </StrapiDataContext.Provider>
          </AdContext.Provider>
        </ReaderPanelContext.Provider>
      );
    },
  ],
};

export default preview;
