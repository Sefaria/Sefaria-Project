import React, { useState } from 'react';

function WebComponentLoader(props) {
  const [link, setLink] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [pluginName, setPluginName] = useState('sefaria-plugin');
  const sref = props.sref;

  const repoToRawLink = (link, target) => {
    const repo = link.split('github.com/')[1].split('/');
    const JsUrl = `https://${repo[0]}.github.io/${repo[1]}/plugin.js`
    const middlewareLink = `/plugin/dev?target=${target}&plugin_url=${JsUrl}`
    return middlewareLink
  }

  let script = null;
  let rand = Math.floor(Math.random() * 1000);
    
  const handleClick = () => {
    if (script) {
      document.head.removeChild(script);
      setLoaded(false);
    }
    if (link) {
      const target = `sefaria-plugin-${rand}`
      setPluginName(target);
      script = document.createElement('script');
      script.src = repoToRawLink(link, target);
      script.async = true;
      script.onload = () => {
        setLoaded(true);
      };
      document.head.appendChild(script);
    }
  };

  if (loaded) {
    const PluginElm = pluginName;
    return (
            <div>
                <button onClick={handleClick}>Reload Plugin</button>
                <PluginElm sref={sref} />
            </div>
        );
  }

  return (
    <div>
      <input
        type="text"
        placeholder="Enter script link"
        value={link}
        onChange={(e) => setLink(e.target.value)}
      />
      <button onClick={handleClick}>Pull</button>
    </div>
  );
}

export default WebComponentLoader;
