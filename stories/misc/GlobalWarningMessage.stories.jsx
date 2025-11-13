import React, { useEffect } from "react";
import { GlobalWarningMessage } from "@static/js/Misc.jsx";

const meta = {
  title: "Misc/GlobalWarningMessage",
  component: GlobalWarningMessage,
  parameters: {
    layout: "padded",
  },
  argTypes: {
    message: {
      control: "text",
      description: "HTML string injected into the warning banner",
    },
  },
  args: {
    message: "<strong>Maintenance:</strong> Site updates may briefly interrupt service.",
  },
};

export default meta;

export const Default = {
  render: (args) => {
    useEffect(() => {
      if (typeof globalThis !== "undefined") {
        globalThis.Sefaria = globalThis.Sefaria || {};
        globalThis.Sefaria.globalWarningMessage = args.message;
      }

      return () => {
        if (typeof globalThis !== "undefined" && globalThis.Sefaria) {
          globalThis.Sefaria.globalWarningMessage = null;
        }
      };
    }, [args.message]);

    return <GlobalWarningMessage />;
  },
};
