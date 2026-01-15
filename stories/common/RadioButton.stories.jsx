import React, { useState } from "react";
import RadioButton from "@static/js/common/RadioButton.jsx";

const meta = {
  title: "Common/RadioButton",
  component: RadioButton,
  parameters: {
    layout: "centered",
  },
  argTypes: {
    isActive: {
      control: "boolean",
      description: "Whether the radio is selected",
    },
    label: {
      control: "text",
      description: "Label rendered next to the radio",
    },
    value: {
      control: "text",
      description: "The value dispatched when selected",
    },
    name: {
      control: "text",
      description: "Radio group name",
    },
  },
  args: {
    id: "storybook-radio-option",
    name: "storybook-radio",
    value: "option-a",
    label: "Enable setting",
    isActive: false,
    onClick: () => {},
  },
};

export default meta;

export const Unchecked = {};

export const Checked = {
  args: {
    isActive: true,
  },
};

export const InteractiveGroup = {
  render: (args) => {
    const options = [
      { id: "storybook-radio-option-a", label: "Option A" },
      { id: "storybook-radio-option-b", label: "Option B" },
      { id: "storybook-radio-option-c", label: "Option C" },
    ];

    const [selected, setSelected] = useState(args.value);

    return (
      <div role="radiogroup" aria-labelledby="storybook-radio-group-label">
        <p id="storybook-radio-group-label" style={{ marginBottom: 12 }}>
          Choose an option
        </p>
        {options.map((option) => (
          <RadioButton
            key={option.id}
            {...args}
            id={option.id}
            value={option.id}
            label={option.label}
            isActive={selected === option.id}
            onClick={() => {
              setSelected(option.id);
              args.onClick?.(option.id);
            }}
          />
        ))}
      </div>
    );
  },
};
