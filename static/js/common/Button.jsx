import React from 'react';
import PropTypes from 'prop-types';
import Util from '../sefaria/util';



/**
 *
 * Button component - keep this clean and minimal.
 * Stick to the defined variants where possible and avoid adding new ones.
 * Use className only for edge cases requiring specific styling (e.g. A button implementation with a color not according to the theme) - prefer existing variants.
 * 
 * @param variant can be empty or "secondary" or "icon-only"
 * @param size can be empty or "large", "small" or "fullwidth"
 * @param icon only the name of the icon without the extension
 * @param children you can pass additional html or just <InterfaceText>
 * @param onClick callback func to trigger
 * @param disabled whether the button is to be disabled or not
 * @param className additional class names in case they are needed (preferrably not)
 * @param href if provided, renders as <a> tag instead of button
 * @param target if provided, sets the target attribute for links (e.g., "_blank")
 * @param activeModule if provided, sets data-active-module attribute for CSS theming
 * @param targetModule if provided, sets data-target-module attribute for JS navigation (only valid with href)
 * @param ariaLabel required for icon-only buttons (buttons with icon but no children) for accessibility
 * @returns {JSX.Element}
 * @constructor
 */
const Button = ({
  variant = 'sefaria-common-button',
  size = '',
  icon=null,
  children,
  onClick,
  disabled = false,
  className = '',
  activeModule = null,
  targetModule = null,
  href,
  target = null,
  ariaLabel
}) => {
  const buttonClasses = `${variant} ${size} ${className}`;
  const rel = target === "_blank" ? "noopener noreferrer" : null;

  // We want to use the correct <a> tag for links. This keeps things semantically correct for accessibility. It also keeps the right click menue suitable.
  // For accessibility we can't have nested buttons (current pattern is <Button><a>content<a><Button>).
  if (href) {
    return (
      <a
        href={href}
        className={buttonClasses}
        onClick={onClick}
        onKeyDown={disabled ? null : (e) => Util.handleLinkSpaceKey(e, onClick)}
        tabIndex={0}
        role="button"
        {...(!!target ? { target } : {})}
        {...(!!rel ? { rel } : {})}
        {...(ariaLabel ? { 'aria-label': ariaLabel, title: ariaLabel } : {})}
        {...(!!targetModule ? { 'data-target-module': targetModule } : {})}
        {...(!!activeModule ? { 'data-active-module': activeModule } : {})}
      >
        {icon && (<img src={`/static/icons/${icon}.svg`} className="button-icon" alt="" aria-hidden="true" />)}
        {children}
      </a>
    );
  }

  return (
    <button
      disabled={disabled}
      {...(!!activeModule ? { 'data-active-module': activeModule } : {})}
      className={buttonClasses}
      onClick={onClick}
      {...(ariaLabel ? { 'aria-label': ariaLabel, title: ariaLabel } : {})}
    >
      {icon && (<img src={`/static/icons/${icon}.svg`} className="button-icon" alt="" aria-hidden="true" />)}
      {children}
    </button>
  );
};

// Custom PropTypes validator for ariaLabel when button is icon-only
// Making sure that ariaLabel is provided for icon-only buttons (icon without children) for accessibility
const ariaLabelValidator = (props, propName, componentName) => {
  const ariaLabel = props[propName];
  const {icon,  children} = props;

  // Require ariaLabel only for icon-only buttons (icon present but no children)
  if (icon && !children && !ariaLabel) {
    return new Error(
      `Invalid prop \`${propName}\` supplied to \`${componentName}\`. ` +
      `\`${propName}\` is required for icon-only buttons (buttons with icon but no children) for accessibility. ` +
      `Please provide descriptive ariaLabel text for the button.`
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
  targetModule: PropTypes.string,
  target: PropTypes.string,
  ariaLabel: ariaLabelValidator
};

export default Button;
