import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode, useState } from 'react';
import { axe } from 'vitest-axe';
import { describe, expect, it, vi } from 'vitest';
import { Dialog } from '../Dialog';

function Harness({ onClose = () => {} }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open it</button>
      {open && (
        <Dialog
          labelledBy="title"
          onClose={() => {
            onClose();
            setOpen(false);
          }}
        >
          <h2 id="title">Hello</h2>
          <button>Inside</button>
        </Dialog>
      )}
    </>
  );
}

describe('Dialog', () => {
  it('opens as a modal labelled by its title, and locks body scroll', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Open it' }));
    const dialog = screen.getByRole('dialog', { name: 'Hello' });
    expect(dialog).toHaveAttribute('open');
    expect(document.body).toHaveClass('dp-scroll-locked');
  });

  it('closes on the native close event (Escape) and returns focus to the invoker', async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const trigger = screen.getByRole('button', { name: 'Open it' });
    trigger.focus();
    await userEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Hello' });
    act(() => {
      // what the browser does on Escape: closes the dialog, then fires "close"
      dialog.removeAttribute('open');
      dialog.dispatchEvent(new Event('close'));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.body).not.toHaveClass('dp-scroll-locked');
    expect(trigger).toHaveFocus();
  });

  it('ignores a stale close event while it is open (React strict mode re-runs effects)', async () => {
    const onClose = vi.fn();
    render(
      <StrictMode>
        <Harness onClose={onClose} />
      </StrictMode>
    );
    await userEvent.click(screen.getByRole('button', { name: 'Open it' }));
    const dialog = screen.getByRole('dialog', { name: 'Hello' });
    act(() => {
      dialog.dispatchEvent(new Event('close')); // still open: not a real close
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Hello' })).toBeInTheDocument();
  });

  it('closes on a backdrop click but not on a click inside', async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open it' }));
    const dialog = screen.getByRole('dialog', { name: 'Hello' });
    await userEvent.click(screen.getByRole('button', { name: 'Inside' }));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(dialog);
    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('has no axe violations', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Open it' }));
    expect(await axe(screen.getByRole('dialog', { name: 'Hello' }))).toHaveNoViolations();
  });
});
