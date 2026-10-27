import React, {useMemo, useState} from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import Sefaria from './sefaria/sefaria';
import {InterfaceText} from './Misc';
import {ContentText} from './ContentText';
import Modal from './common/modal';
import {
  buildCustomizeTree,
  flattenLeaves,
  getDisplayOptions,
  getHiddenRefs,
  leavesOf,
  normalizeHiddenRefs,
  setDisplayOptions,
  setHiddenRefs
} from './sefaria/siddurCustomization';


const nodeState = (node, hidden) => {
  const leaves = leavesOf(node);
  const numHidden = leaves.filter(leaf => hidden.has(leaf.ref)).length;
  return numHidden === 0 ? "all" : numHidden === leaves.length ? "none" : "some";
};


const SiddurCustomizeNode = ({node, hidden, collapsed, onToggle, onToggleCollapse}) => {
  const state = nodeState(node, hidden);
  const hasChildren = node.children.length > 0;
  const isCollapsed = collapsed.has(node.ref);
  return (
    <li className="siddurCustomizeNode">
      <div className="siddurCustomizeRow">
        {hasChildren ?
          <button
            type="button"
            className={classNames("siddurCustomizeCaret", {collapsed: isCollapsed})}
            aria-expanded={!isCollapsed}
            aria-label={Sefaria._(isCollapsed ? "siddur_customize.expand" : "siddur_customize.collapse")}
            onClick={() => onToggleCollapse(node.ref)}
          /> : <span className="siddurCustomizeCaret placeholder" />}
        <label>
          <input
            type="checkbox"
            checked={state === "all"}
            ref={el => { if (el) { el.indeterminate = state === "some"; } }}
            onChange={() => onToggle(node, state !== "all")}
          />
          <ContentText text={{en: node.en, he: node.he}} defaultToInterfaceOnBilingual={true} />
        </label>
      </div>
      {hasChildren && !isCollapsed ?
        <ul>
          {node.children.map(child =>
            <SiddurCustomizeNode key={child.ref} node={child} hidden={hidden} collapsed={collapsed}
                                 onToggle={onToggle} onToggleCollapse={onToggleCollapse} />)}
        </ul> : null}
    </li>
  );
};


const SiddurCustomizeModal = ({title, schema, close}) => {
  // Tree of every section of the siddur; unchecked leaves are saved as hidden.
  // Top-level sections start expanded, everything below them collapsed.
  const tree = useMemo(() => buildCustomizeTree(schema, title), [schema, title]);
  const leafRefs = useMemo(() => flattenLeaves(tree).map(leaf => leaf.ref), [tree]);
  const [hidden, setHidden] = useState(() => new Set(normalizeHiddenRefs(tree, getHiddenRefs(title))));
  const [options, setOptions] = useState(() => getDisplayOptions(title));
  const [collapsed, setCollapsed] = useState(() => new Set(
    tree.flatMap(node => node.children).flatMap(function parents(node) {
      return node.children.length ? [node.ref, ...node.children.flatMap(parents)] : [];
    })));

  const toggle = (node, show) => {
    const next = new Set(hidden);
    leavesOf(node).forEach(leaf => show ? next.delete(leaf.ref) : next.add(leaf.ref));
    setHidden(next);
  };
  const toggleCollapse = ref => {
    const next = new Set(collapsed);
    next.has(ref) ? next.delete(ref) : next.add(ref);
    setCollapsed(next);
  };
  const save = () => {
    setHiddenRefs(title, leafRefs.filter(ref => hidden.has(ref)));
    setDisplayOptions(title, options);
    close();
  };

  return (
    <Modal close={close} className="siddurCustomizeModal">
      <div className="siddurCustomize">
        <div className="siddurCustomizeHeader">
          <h2><InterfaceText>siddur_customize.title</InterfaceText></h2>
          <button type="button" className="siddurCustomizeClose" aria-label={Sefaria._("common.close")} onClick={close}>×</button>
        </div>
        <p className="siddurCustomizeDescription">
          <InterfaceText>siddur_customize.description</InterfaceText>
        </p>
        <div className="siddurCustomizeOptions">
          {[["showInstructions", "siddur_customize.show_instructions"], ["showHints", "siddur_customize.show_hints"]].map(([key, label]) =>
            <label className="siddurCustomizeOption" key={key}>
              <input
                type="checkbox"
                role="switch"
                checked={options[key]}
                onChange={() => setOptions({...options, [key]: !options[key]})}
              />
              <InterfaceText>{label}</InterfaceText>
            </label>)}
        </div>
        <ul className="siddurCustomizeTree">
          {tree.map(node =>
            <SiddurCustomizeNode key={node.ref} node={node} hidden={hidden} collapsed={collapsed}
                                 onToggle={toggle} onToggleCollapse={toggleCollapse} />)}
        </ul>
        <div className="siddurCustomizeFooter">
          <button type="button" className="button small white" onClick={() => setHidden(new Set())} disabled={!hidden.size}>
            <InterfaceText>siddur_customize.show_all</InterfaceText>
          </button>
          <div className="siddurCustomizeFooterActions">
            <button type="button" className="button small white" onClick={close}>
              <InterfaceText>common.cancel</InterfaceText>
            </button>
            <button type="button" className="button small" onClick={save}>
              <InterfaceText>common.save</InterfaceText>
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
SiddurCustomizeModal.propTypes = {
  title:  PropTypes.string.isRequired,
  schema: PropTypes.object.isRequired,
  close:  PropTypes.func.isRequired,
};

export default SiddurCustomizeModal;
