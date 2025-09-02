import PropTypes from 'prop-types';



/**
 *
 * @param variant can be empty or "secondary"
 * @param size can be empty or "large", "small" or "fullwidth"
 * @param icon only the name of the icon without the extension
 * @param children you can pass additional html or just <InterfaceText>
 * @param onClick callback func to trigger
 * @param disabled whether the button is to be disabled or not
 * @param className additional class names in case they are needed (preferrably not)
 * @param href if provided, renders as <a> tag instead of button
 * @param activeModule if provided, sets data-active-module attribute for CSS theming
 * @param targetModule if provided, sets data-target-module attribute for JS navigation (only valid with href)
 * @returns {JSX.Element}
 * @constructor
 */
const Button = ({
  variant = 'sefaria-common-button',
  size = '',
  icon,
  children,
  onClick,
  disabled = false,
  className = '',
  activeModule = null,
  targetModule = null,
  href
}) => {
  const buttonClasses = `${variant} ${size} ${className}`;

  // We want to use the correct <a> tag for links. This keeps things semantically correct for accessibility. It also keeps the right click menue suitable.
  // For accessibility we can't have nested buttons (current pattern is <Button><a>content<a><Button>).
  if (href) {
    const handleKeyDown = (e) => {
      // For links: only Space activates (Enter is handled by default link behavior)
      if (e.key === ' ') {
        e.preventDefault();
        if (onClick && !disabled) {
          onClick(e);
        } else if (!disabled) {
          // For href-based buttons without onClick, trigger the default link behavior
          e.target.click();
        }
      }
    };

    return (
      <a
        href={href}
        className={buttonClasses}
        onClick={onClick}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="button"
        {...(!!targetModule ? { 'data-target-module': targetModule } : {})}
        {...(!!activeModule ? { 'data-active-module': activeModule } : {})}
      >
        {icon && (<img src={`/static/icons/${icon}.svg`} className="button-icon" alt={icon} />)}
        {children}
      </a>
    );
  }

  const handleKeyDown = (e) => {
    // For buttons: both Enter and Space activate
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (onClick && !disabled) {
        onClick(e);
      }
    }
  };
  return (
    <button
      disabled={disabled}
      {...(!!activeModule ? { 'data-active-module': activeModule } : {})}
      className={buttonClasses}
      onClick={onClick}
      onKeyDown={handleKeyDown}
    >
      {icon && (<img src={`/static/icons/${icon}.svg`} className="button-icon" alt={icon} />)}
      {children}
    </button>
  );
};

// Custom PropTypes validator for targetModule
const targetModuleValidator = (props, propName, componentName) => {
  const targetModule = props[propName];
  const href = props.href;

  if (targetModule && !href) {
    return new Error(
      `Invalid prop \`${propName}\` supplied to \`${componentName}\`. ` +
      `\`${propName}\` can only be used when \`href\` prop is provided.`
    );
  }

  return PropTypes.string(props, propName, componentName);
};

Button.propTypes = {
  variant: PropTypes.string,
  size: PropTypes.string,
  icon: PropTypes.string,
  children: PropTypes.node,
  onClick: PropTypes.func,
  disabled: PropTypes.bool,
  className: PropTypes.string,
  href: PropTypes.string,
  activeModule: PropTypes.string,
  targetModule: targetModuleValidator
};

export default Button;

/**
 * Reusable keyboard handler for accessibility.
 * Supports the two common patterns found throughout the codebase.
 *
 * @param {function} [onClick] - Custom click handler to call instead of element.click()
 * @returns {function} - Keyboard event handler function
 *
 * @example
 * // For elements that should trigger their own click behavior:
 * const handleKeyDown = handleKeyboardClick();
 * <button onKeyDown={handleKeyDown}>Click me</button>
 *
 * @example
 * // For elements with custom click handlers:
 * const handleKeyDown = handleKeyboardClick(myCustomClickHandler);
 * <div onKeyDown={handleKeyDown}>Custom element</div>
 */
const handleKeyboardClick = (onClick) => {
  return (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (onClick) {
        onClick(e);
      } else {
        e.currentTarget.click();
      }
    }
  };
};

// Export for temporary use by other components during migration
export { handleKeyboardClick };