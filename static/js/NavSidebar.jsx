import {
  IntText,
} from './Misc';
import React  from 'react';
import classNames  from 'classnames';
import PropTypes  from 'prop-types';
import Sefaria  from './sefaria/sefaria';


const NavSidebar = ({modules}) => {
  return <div className="navSidebar">
    {modules.map(m => 
      <Modules 
        type={m.type} 
        props={m.props || {}} 
        key={m.type} />
    )}
  </div>
};


const Modules = ({type, props}) => {
  // Choose the appropriate module component to render by `type`
  const moduleTypes = {
    "TheJewishLibrary": TheJewishLibrary,
    "AboutTextCategory": AboutTextCategory,
  };
  const ModuleType = moduleTypes[type];
  return <ModuleType {...props} />
}


const Module = ({children}) => (
  <div className="navSidebarModule">{children}</div>
);


const TitledTextModule = ({title, text}) => (
  <Module>
    <h3><IntText>{title}</IntText></h3>
    <IntText>{text}</IntText>
  </Module>
);


const TheJewishLibrary = () => (
  <TitledTextModule
    title="The Jewish Library"
    text="The tradition of Torah texts is a vast, interconnected network that forms a conversation across space and time. The five books of the Torah form its foundation, and each generation of later texts functions as a commentary on those that came before it." />
)


const AboutTextCategory = ({cats}) => {
  console.log(cats)
  const tocObject = Sefaria.tocObjectByCategories(cats);

  const enTitle = "About " + tocObject.category;
  const heTitle = "אודות " + tocObject.heCategory;

  return (
    <Module>
      <h3><IntText en={enTitle} he={heTitle}/></h3>
      <IntText en={tocObject.enDesc} he={tocObject.heDesc} />
    </Module>
  );
};


export default NavSidebar;