/**
 * Unified Button Component with Accessibility Support
 * 
 * @param variant can be empty or "secondary" or "legacy"
 * @param size can be empty or "large" or "fullwidth" or "small" or "extraSmall" or "fillWidth"
 * @param icon only the name of the icon without the extension
 * @param children you can pass additional html or just <InterfaceText>
 * @param onClick callback func to trigger
 * @param disabled whether the button is to be disabled or not
 * @param className additional class names in case they are needed (preferrably not)
 * @param activeModule module identifier for tracking
 * @param ariaLabel accessible label for screen readers (required for icon-only buttons)
 * @param deprecationWarning show console warning for legacy usage patterns
 * @returns {JSX.Element}
 * @constructor
 */
const Button = ({ 
  variant = '', 
  size = '', 
  icon, 
  children, 
  onClick, 
  disabled = false, 
  className = '', 
  activeModule,
  ariaLabel,
  deprecationWarning = false
}) => {
  // Accessibility validation in development
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    // Warn if icon-only button lacks accessible label
    if (icon && !ariaLabel && !children) {
      console.warn('Button with icon needs ariaLabel or children for accessibility:', { icon });
    }
    
    // Show deprecation warning if requested
    if (deprecationWarning) {
      console.warn('DEPRECATED: Consider migrating from legacy .button class to this Button component');
    }
  }

  const buttonProps = {
    disabled,
    className: `sefaria-common-button ${variant} ${size} ${className}`,
    onClick,
    ...(activeModule ? { 'data-active-module': activeModule } : {}),
    ...(ariaLabel ? { 'aria-label': ariaLabel } : {})
  };

  return (
    <button {...buttonProps}>
      {icon && (
        <img 
          src={`/static/icons/${icon}.svg`} 
          className="button-icon" 
          alt={ariaLabel || icon} 
        />
      )}
      {children}
    </button>
  );
};

export default Button;