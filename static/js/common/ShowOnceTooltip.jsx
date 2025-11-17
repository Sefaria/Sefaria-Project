import React, { useEffect, useState } from 'react';
import Tooltip from './Tooltip';

/**
 * Wrapper that adds optional localStorage-based "show once" behavior.
 * - If `open` prop is provided, acts as a controlled component.
 * - If `open` is not provided, manages its own visibility:
 *    - Reads `storageKey` on mount (if provided). If value !== 'true', it opens.
 *    - When dismissed (by confirm button or external close), sets storageKey to 'true'.
 * 
 * @param {string} storageKey - localStorage key for persistence (required)
 * @param {boolean} open - controlled open state (optional)
 * @param {function} onOpenChange - callback when open state changes (optional)
 * @param {object} confirm - confirmation button config; when clicked, dismisses and persists
 * @param rest - all other props passed to Tooltip
 */
const ShowOnceTooltip = ({
  storageKey,
  open: controlledOpen,
  onOpenChange,
  confirm,
  ...rest
}) => {
  const isControlled = controlledOpen !== undefined;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);

  // Initialize based on storageKey when uncontrolled
  useEffect(() => {
    if (!isControlled) {
      const dismissed = storageKey ? localStorage.getItem(storageKey) : null;
      setUncontrolledOpen(dismissed !== 'true');
    }
  }, [isControlled, storageKey]);

  const setOpen = (nextOpen) => {
    if (isControlled) {
      onOpenChange?.(nextOpen);
    } else {
      setUncontrolledOpen(nextOpen);
    }
    if (storageKey && nextOpen === false) {
      localStorage.setItem(storageKey, 'true');
    }
  };

  // Wrap confirm to also dismiss
  const wrappedConfirm = confirm
    ? {
        ...confirm,
        onClick: () => {
          setOpen(false);
          confirm?.onClick && confirm.onClick();
        },
      }
    : undefined;

  return (
    <Tooltip
      open={isControlled ? controlledOpen : uncontrolledOpen}
      onOpenChange={setOpen}
      confirm={wrappedConfirm}
      {...rest}
    />
  );
};

export default ShowOnceTooltip;


