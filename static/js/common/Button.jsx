import PropTypes from 'prop-types';
import Util from '../sefaria/util';



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
 * @param alt required when icon is provided for accessibility (alt text for the icon)
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
  alt
}) => {
  const buttonClasses = `${variant} ${size} ${className}`;

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
        {...(!!targetModule ? { 'data-target-module': targetModule } : {})}
        {...(!!activeModule ? { 'data-active-module': activeModule } : {})}
      >
        {icon && (<img src={`/static/icons/${icon}.svg`} className="button-icon" alt={alt} />)}
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
    >
      {icon && (<img src={`/static/icons/${icon}.svg`} className="button-icon" alt={alt} />)}
      {children}
    </button>
  );
};

// Custom PropTypes validator for alt text when icon is present
// Making sure that alt text is provided when icon is provided for accessibility
const altTextValidator = (props, propName, componentName) => {
  const alt = props[propName];
  const icon = props.icon;

  if (icon && (alt === undefined || alt === null || alt === '')) {
    return new Error(
      `Invalid prop \`${propName}\` supplied to \`${componentName}\`. ` +
      `\`${propName}\` is required when \`icon\` prop is provided for accessibility. ` +
      `Please provide descriptive alt text for the icon.`
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
  alt: altTextValidator
};

export default Button;