import React, { useEffect, useState } from "react";
import { OnInView } from "@static/js/Misc.jsx";

const meta = {
  title: "Misc/OnInView",
  component: OnInView,
  parameters: {
    layout: "padded",
  },
  argTypes: {
    threshold: {
      control: "number",
      table: { disable: true },
      description: "Visibility threshold handled internally (fixed at 1)",
    },
  },
};

export default meta;

export const FiresCallback = {
  render: () => {
    const [triggered, setTriggered] = useState(false);

    useEffect(() => {
      if (typeof window !== "undefined" && typeof window.IntersectionObserver === "undefined") {
        window.IntersectionObserver = class {
          constructor(callback) {
            this._callback = callback;
          }
          observe(target) {
            // Simulate visibility without requiring manual scrolling
            this._callback([{ isIntersecting: true, target }]);
          }
          unobserve() {}
          disconnect() {}
        };
      }
    }, []);

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <p style={{ margin: 0 }}>
          `OnInView` invokes <code>onVisible</code> once the wrapped content intersects the viewport.
        </p>
        <OnInView onVisible={() => setTriggered(true)}>
          <div
            style={{
              border: "2px dashed var(--sefaria-blue)",
              borderRadius: 12,
              padding: 32,
              textAlign: "center",
              background: "var(--color-gray-0)",
            }}
          >
            Watch me
          </div>
        </OnInView>
        <p>
          Status:{" "}
          <strong style={{ color: triggered ? "var(--color-success)" : "var(--color-text-secondary)" }}>
            {triggered ? "Visible" : "Waiting…"}
          </strong>
        </p>
      </div>
    );
  },
};

