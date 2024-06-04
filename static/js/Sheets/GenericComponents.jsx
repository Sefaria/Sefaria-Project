import {InterfaceText} from "../Misc";
import classNames from "classnames";
import React from "react";
const Button = ({img, href, children, classes={}}) => {
  classes = {button: 1, ...classes};
  return <a className={classNames(classes)} href={href}>
          {img}
          <InterfaceText>{children}</InterfaceText>
          </a>
}

const Box = ({boxTitleChildren, boxTitleHref, onBoxTitleClick, boxTextChildren}) => {
    return <div className="navBlock">
                <a href={boxTitleHref} className="navBlockTitle" onClick={onBoxTitleClick}>
                    {boxTitleChildren}
                </a>
                <div className="navBlockDescription">
                    {boxTextChildren}
                </div>
            </div>
}

export { Button, Box }
