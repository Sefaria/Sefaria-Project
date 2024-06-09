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

const Card = ({cardTitle, cardTitleHref, oncardTitleClick, cardText}) => {
    return <div className="navBlock">
                <a href={cardTitleHref} className="navBlockTitle" onClick={oncardTitleClick}>
                    <InterfaceText text={cardTitle}/>
                </a>
                <div className="navBlockDescription">
                    <InterfaceText text={cardText}/>
                </div>
            </div>
}

export { Button, Card }
