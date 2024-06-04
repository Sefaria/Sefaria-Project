import {InterfaceText} from "../Misc";
import classNames from "classnames";
const Button = ({img, href, children, classes={}}) => {
    /*
        Generic button component that links to an href, and displays text and optionally an image
     @param {component} img -- expected HTML img component
     @param {string} href -- Where should the button link to?
     @param {children} -- Text of the button
     @param {obj} -- JS object of properties to be passed to classNames such as {small: 1}
     */
  classes = {button: 1, ...classes};
  return <a className={classNames(classes)} href={href}>
          {img}
          <InterfaceText>{children}</InterfaceText>
          </a>
}

export { Button }