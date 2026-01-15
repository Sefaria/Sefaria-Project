import React, { useState } from "react";
import Modal from "@static/js/common/modal.jsx";
import Button from "@static/js/common/Button.jsx";

const meta = {
  title: "Common/Modal",
  component: Modal,
  parameters: {
    layout: "fullscreen",
  },
  argTypes: {
    heading: {
      control: "text",
      description: "Headline displayed inside the modal",
    },
    body: {
      control: "text",
      description: "Body copy rendered below the heading",
    },
    onClose: {
      action: "closed",
      description: "Invoked when the modal is dismissed",
    },
  },
  args: {
    heading: "Storybook Modal",
    body: "Dialogs are useful for confirming actions or highlighting urgent information.",
  },
};

export default meta;

export const Default = {
  render: (args) => {
    const [isOpen, setIsOpen] = useState(false);

    const closeModal = () => {
      setIsOpen(false);
      args.onClose?.();
    };

    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
        }}
      >
        <Button onClick={() => setIsOpen(true)}>Open modal</Button>
        {isOpen && (
          <Modal close={closeModal}>
            <div style={{ textAlign: "left" }}>
              <h2 style={{ marginTop: 0 }}>{args.heading}</h2>
              <p style={{ marginBottom: 24 }}>{args.body}</p>
              <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                <Button className="secondary" onClick={closeModal}>
                  Cancel
                </Button>
                <Button onClick={closeModal}>Confirm</Button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    );
  },
};
