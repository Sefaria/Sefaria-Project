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
  
  if (href) { // For accessibility we can't have nested buttons
    return (
      <a
        href={href}
        className={buttonClasses}
        onClick={onClick}
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
    >
      {icon && (<img src={`/static/icons/${icon}.svg`} className="button-icon" alt={icon} />)}
      {children}
    </button>
  );
};

export default Button;