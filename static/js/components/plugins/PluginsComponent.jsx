import React, { useState } from 'react';
import PluginList from './PluginList';
import WebComponentLoader from './WebComponentLoader';

const PluginsComponent = (props) => {
    const [showDevelopers, setShowDevelopers] = useState(false);
    const [showPluginOptions, setShowPluginOptions] = useState(true);

    const toggleComponent = () => {
        setShowDevelopers(!showDevelopers);
    };

    const pluginListCreateToggle = (<span style={{
            fontFamily: "Roboto, Helvetica Neue, Helvetica, sans-serif",
            textTransform: "uppercase",
            alignSelf: "flex-start",
            color: "#999",
            border: "1px solid #CCC",
            borderRadius: "3px",
            fontSize: "12px",
            lineHeight: "18px",
            padding: "0px 3px",
            marginLeft: "4px",
            float: "right",
            cursor: "pointer",
        }}
        onClick={toggleComponent}>
            {showDevelopers ? 'Plugin List' : 'Create'}
        </span>)

    return (
        <div>
            {showPluginOptions && pluginListCreateToggle}
            {showDevelopers ? <WebComponentLoader sref={props.sref} isDeveloper={true} setShowPluginOptions={setShowPluginOptions} /> : <PluginList sref={props.sref} setShowPluginOptions={setShowPluginOptions}  />}
        </div>
    );
};

export default PluginsComponent;