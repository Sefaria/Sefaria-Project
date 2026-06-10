import React, { useState } from "react";
import ToggleSwitch from "@static/js/common/ToggleSwitch.jsx";

const meta = {
  title: "Common/ToggleSwitch",
  component: ToggleSwitch,
  parameters: {
    layout: "centered",
  },
  argTypes: {
    isChecked: {
      control: "boolean",
      description: "Marks the switch as on/off",
    },
    disabled: {
      control: "boolean",
    },
    name: {
      control: "text",
      description: "ID used for the input element",
    },
  },
  args: {
    name: "storybook-toggle-switch",
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
      <ToggleSwitch
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
