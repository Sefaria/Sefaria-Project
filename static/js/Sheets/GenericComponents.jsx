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

const Card = ({cardTitleChildren, cardTitleHref, oncardTitleClick, cardTextChildren}) => {
    return <div className="navBlock">
                <a href={cardTitleHref} className="navBlockTitle" onClick={oncardTitleClick}>
                    {cardTitleChildren}
                </a>
                <div className="navBlockDescription">
                    {cardTextChildren}
                </div>
            </div>
}

export { Button, Card }
