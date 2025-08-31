/**
 *
 * @param variant defaults to "sefaria-common-button"
 * @param size is a css class
 * @param icon only the name of the icon without the extension
 * @param children you can pass additional html or just <InterfaceText>
 * @param onClick callback func to trigger
 * @param disabled whether the button is to be disabled or not
 * @param className additional class names in case they are needed (preferrably not)
 * @param href if provided, renders as anchor tag instead of button
 * @param activeModule if provided, sets data-target-module attribute
 * @returns {JSX.Element}
 * @constructor
 */
const Button = ({ variant = 'sefaria-common-button', size = '', icon, children, onClick, disabled=false, className = '', activeModule=null, href }) => {
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
        {...(!!activeModule ? { 'data-target-module': activeModule } : {})}
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
      {...(!!activeModule ? { 'data-target-module': activeModule } : {})}
      className={buttonClasses}
      onClick={onClick}
      onKeyDown={handleKeyDown}
    >
      {icon && (<img src={`/static/icons/${icon}.svg`} className="button-icon" alt={icon} />)}
      {children}
    </button>
  );
};

export default Button;