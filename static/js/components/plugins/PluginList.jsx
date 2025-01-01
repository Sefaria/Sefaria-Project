import React, { useEffect, useState } from 'react';
import WebComponentLoader from './WebComponentLoader';
import sefaria from '../../sefaria/sefaria';

const PluginList = (props) => {
    const [plugins, setPlugins] = useState([]);
    const [pluginLink, setPluginLink] = useState('');
    const setShowPluginOptions = props.setShowPluginOptions;

    useEffect(() => {
        const fetchPlugins = async () => {
            try {
                const data = await sefaria.getPlugins();
                setPlugins(data.plugins);
            } catch (error) {
                console.error('Error fetching plugins:', error);
            }
        };

        fetchPlugins();
    }, []);

    const pluginButton = (plugin) => {
        return (
            <div key={plugin.id} className="categoryFilterGroup" style={{ '--category-color': 'var(--commentary-blue)' }}>
            <a onClick={() => setPluginLink(plugin.url)}>
                <div className="categoryFilter" data-name="Commentary" style={{ marginLeft: 0 }}>
                <span className="filterText">
                    <img src={plugin.image} alt={plugin.description} style={{ float: 'left', maxHeight: '20px', maxWidth: '20px' }} />
                    <span className="contentSpan en" lang="en">{plugin.description}</span>
                </span>
                </div>
            </a>
            </div>
        )
    }

    const pluginMenu = (
        <div>
            <div style={{ margin: 0 }} className="connectionPanelSectionHeader sans-serif">
                <span className="connectionPanelSectionHeaderInner">
                    <span className="int-en">Active Plugins</span>
                </span>
            </div>
            <div>
                {plugins.map((plugin) => ( pluginButton(plugin) ))}
            </div>
        </div>
    );

    return (
        <div>
            {pluginLink ? (
                <WebComponentLoader pluginLink={pluginLink} sref={props.sref} setShowPluginOptions={setShowPluginOptions} />
            ) : pluginMenu}
        </div>
    );
};

export default PluginList;