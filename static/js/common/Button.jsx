/**
 *
 * @param variant can be empty or "secondary"
 * @param size can be empty or "large" or "fullwidth"
 * @param icon only the name of the icon without the extension
 * @param children you can pass additional html or just <InterfaceText>
 * @param onClick callback func to trigger
 * @param disabled whether the button is to be disabled or not
 * @param className additional class names in case they are needed (preferrably not)
 * @param href if provided, renders as anchor tag instead of button
 * @returns {JSX.Element}
 * @constructor
 */
const Button = ({ variant = '', size = '', icon, children, onClick, disabled=false, className = '', activeModule=null, href }) => {
  const buttonClasses = `sefaria-common-button ${variant} ${size} ${className}`;
  
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (onClick && !disabled) {
        onClick(e);
      } else if (href && !disabled) {
        // For href-based buttons without onClick, trigger the default link behavior
        e.target.click();
      }
    }
  };
  
  if (href) { // For accessibility we can't have nested buttons
    return (
      <a
        href={href}
        className={buttonClasses}
        onClick={onClick}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="button"
        {...(!!activeModule ? { 'data-active-module': activeModule } : {})}
      >
        {icon && (<img src={`/static/icons/${icon}.svg`} className="button-icon" alt={icon} />)}
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
      onKeyDown={handleKeyDown}
    >
      {icon && (<img src={`/static/icons/${icon}.svg`} className="button-icon" alt={icon} />)}
      {children}
    </button>
  );
};

export default Button;