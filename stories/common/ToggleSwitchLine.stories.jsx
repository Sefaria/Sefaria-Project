import React, { useState } from "react";
import ToggleSwitchLine from "@static/js/common/ToggleSwitchLine.jsx";

const meta = {
  title: "Common/ToggleSwitchLine",
  component: ToggleSwitchLine,
  parameters: {
    layout: "centered",
  },
  argTypes: {
    text: {
      control: "text",
      description: "Label displayed to the left of the switch",
    },
    isChecked: {
      control: "boolean",
    },
    disabled: {
      control: "boolean",
    },
  },
  args: {
    name: "storybook-toggle-switch-line",
    text: "Enable notifications",
    isChecked: false,
    disabled: false,
    onChange: () => {},
  },
};

export default meta;

export const Off = {};

export const On = {
  args: {
    isChecked: true,
  },
};

export const Disabled = {
  args: {
    disabled: true,
  },
};

export const Interactive = {
  render: (args) => {
    const [checked, setChecked] = useState(args.isChecked);

    return (
      <ToggleSwitchLine
        {...args}
        isChecked={checked}
        onChange={(event) => {
          args.onChange?.(event);
          setChecked(event.target.checked);
        }}
      />
    );
  },
};
