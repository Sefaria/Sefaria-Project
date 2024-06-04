import {InterfaceText} from "../Misc";

const Button = (img, href, children, classes={}) => {
  classes = {button: 1, ...classes};
  return <a className={classNames(classes)} href={href}>
          {img}
          <InterfaceText>{children}</InterfaceText>
          </a>
}

export { Button }