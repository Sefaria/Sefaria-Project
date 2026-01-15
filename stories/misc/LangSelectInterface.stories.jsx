import React, { useEffect, useState } from "react";
import { LangSelectInterface } from "@static/js/Misc.jsx";
import Button from "@static/js/common/Button.jsx";

const meta = {
  title: "Misc/LangSelectInterface",
  component: LangSelectInterface,
  parameters: {
    layout: "centered",
  },
  argTypes: {
    defaultVal: {
      control: {
        type: "inline-radio",
      },
      options: ["source", "translation", "sourcewtrans"],
      description: "Initial selection when the popover opens",
    },
  },
  args: {
    defaultVal: "source",
  },
};

export default meta;

export const Playground = {
  render: (args) => {
    const [selection, setSelection] = useState(args.defaultVal);
    const [isOpen, setIsOpen] = useState(true);

    useEffect(() => {
      setSelection(args.defaultVal);
      setIsOpen(true);
    }, [args.defaultVal]);

    const handleClose = () => setIsOpen(false);
    const handleChange = (nextValue) => {
      setSelection(nextValue);
      handleClose();
    };

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "flex-start", minWidth: 280 }}>
        <p style={{ margin: 0 }}>
          Selected value: <strong>{selection}</strong>
        </p>
        <div style={{ display: "flex", gap: 12 }}>
          <Button onClick={() => setIsOpen(true)}>Open selector</Button>
          <Button variant="sefaria-common-button secondary" onClick={() => setSelection(args.defaultVal)}>
            Reset selection
          </Button>
        </div>
        {isOpen ? (
          <LangSelectInterface
            {...args}
            callback={handleChange}
            closeInterface={handleClose}
          />
        ) : (
          <p style={{ color: "var(--color-text-secondary)", margin: 0 }}>
            The selector is hidden. Click &ldquo;Open selector&rdquo; to bring it back.
          </p>
        )}
      </div>
    );
  },
};
