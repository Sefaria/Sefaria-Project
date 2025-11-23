import React, { useState } from "react";
import { Card } from "@static/js/common/Card.jsx";

const meta = {
  title: "Common/Card",
  component: Card,
  parameters: {
    layout: "centered",
  },
  args: {
    cardTitle: { en: "Sample Card", he: "כרטיס לדוגמה" },
    cardTitleHref: "#",
    cardText: {
      en: "A short description with **markdown** support.",
      he: "תיאור קצר עם **מרקדאון**.",
    },
    bottomLinkText: { en: "Learn more", he: "למידע נוסף" },
    bottomLinkUrl: "#",
    analyticsEventName: "card_click",
  },
};

export default meta;

export const Default = {
  render: (args) => {
    const [clicked, setClicked] = useState(false);
    return (
      <div style={{ maxWidth: 360 }}>
        <Card
          {...args}
          cardTitle={{
            en: clicked ? "Clicked!" : args.cardTitle.en,
            he: clicked ? "נלחץ!" : args.cardTitle.he,
          }}
          oncardTitleClick={(e) => {
            e.preventDefault();
            setClicked(true);
          }}
        />
      </div>
    );
  },
};

export const WithoutBottomLink = {
  args: {
    bottomLinkText: null,
    bottomLinkUrl: null,
  },
};
