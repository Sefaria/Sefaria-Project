import React, { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuSeparator,
  DropdownMenuItem,
  DropdownMenuItemLink,
  DropdownMenuItemWithCallback,
  DropdownMenuItemWithIcon,
  DropdownModuleItem,
  DropdownLanguageToggle,
} from "@static/js/common/DropdownMenu.jsx";
import Button from "@static/js/common/Button.jsx";

const meta = {
  title: "Common/DropdownMenu",
  component: DropdownMenu,
  parameters: {
    layout: "centered",
  },
};

export default meta;

const Template = () => {
  const [count, setCount] = useState(0);
  return (
    <DropdownMenu
      positioningClass="headerDropdownMenu"
      buttonComponent={
        <Button variant="sefaria-common-button" size="small">
          Open Menu
        </Button>
      }
    >
      <DropdownMenuItem url="#profile">
        Profile
      </DropdownMenuItem>
      <DropdownMenuItemLink url="https://www.sefaria.org" newTab>
        External Link
      </DropdownMenuItemLink>
      <DropdownMenuItemWithCallback onClick={() => setCount((c) => c + 1)}>
        Increment Counter ({count})
      </DropdownMenuItemWithCallback>
      <DropdownMenuSeparator />
      <DropdownMenuItemWithIcon
        icon="/static/img/developer-icon.svg"
        textEn="Developers"
        descEn="APIs, docs, and tooling"
      />
      <DropdownModuleItem
        url="/"
        newTab={false}
        targetModule="library"
        dotColor="--sefaria-blue"
        text={{ en: "Library Module", he: "מודול ספריה" }}
      />
      <DropdownMenuSeparator />
      <DropdownLanguageToggle />
    </DropdownMenu>
  );
};

export const Default = {
  render: Template,
};
