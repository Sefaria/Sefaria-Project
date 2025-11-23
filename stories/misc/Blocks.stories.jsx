import React from "react";
import classNames from "classnames";
import {
  SimpleInterfaceBlock,
  SimpleContentBlock,
  SimpleLinkedBlock,
  BlockLink,
  ColorBarBox,
  DangerousInterfaceBlock,
} from "@static/js/Misc.jsx";

const meta = {
  title: "Misc/Blocks",
  component: SimpleInterfaceBlock,
  parameters: {
    layout: "centered",
  },
  argTypes: {
    classes: {
      control: "text",
      description: "Custom class names applied to the container",
    },
    en: {
      control: "text",
      description: "English text",
    },
    he: {
      control: "text",
      description: "Hebrew text",
    },
  },
  args: {
    classes: "interfaceBlock sample-block",
    en: "Explore classic sources across the tradition.",
    he: "גלו מקורות קלאסיים.",
  },
};

export default meta;

export const InterfaceBlock = {
  args: {},
};

export const ContentBlock = {
  render: (args) => (
    <SimpleContentBlock classes={classNames("interfaceBlock", "sample-block", args.classes)}>
      <p style={{ margin: 0 }}>
        Storybook lets us exercise layout wrappers without wiring up the entire page.
      </p>
    </SimpleContentBlock>
  ),
};

export const LinkedBlock = {
  render: (args) => (
    <SimpleLinkedBlock
      {...args}
      url="https://www.sefaria.org/texts"
      aclasses="interface-link"
    >
      <p style={{ margin: "8px 0 0" }}>
        Children render beneath the bilingual link, so you can add custom summaries or badges.
      </p>
    </SimpleLinkedBlock>
  ),
};

export const BlockLinkCard = {
  render: () => (
    <BlockLink
      title="Library"
      heTitle="ספריה"
      target="/texts"
      image="/static/icons/library.svg"
      interfaceLink
    />
  ),
};

export const ReferenceHighlight = {
  render: () => (
    <ColorBarBox tref="Genesis 1:1">
      <div style={{ padding: 16 }}>
        <strong>Genesis 1:1</strong>
        <p style={{ margin: "8px 0 0" }}>
          Colored borders inherit the ref&apos;s category palette so cards stay on-brand.
        </p>
      </div>
    </ColorBarBox>
  ),
};

export const DangerousHtmlBlock = {
  render: () => (
    <DangerousInterfaceBlock
      classes="interfaceBlock sample-block"
      en="<strong>Heads up:</strong> HTML content is rendered as provided."
      he="<strong>לתשומת לב:</strong> התוכן מוצג כפי שהוא."
    />
  ),
};
