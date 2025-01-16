import React, { useState, useEffect } from 'react';

function WebComponentLoader(props) {
  const [link, setLink] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [pluginName, setPluginName] = useState('sefaria-plugin');
  const sref = props.sref;
  const pluginLink = props.pluginLink;
  const isDeveloper = props.isDeveloper;
  const setShowPluginOptions = props.setShowPluginOptions;

  useEffect(() => {
    if (pluginLink) {
      setLink(pluginLink);
      loadPlugin(pluginLink);
    }
  }, [pluginLink]);

  const repoToRawLink = (link, target) => {
    const repo = link.split('github.com/')[1].split('/');
    const JsUrl = `https://${repo[0]}.github.io/${repo[1]}/plugin.js`;
    const middlewareLink = `/plugin/dev?target=${target}&plugin_url=${JsUrl}`;
    return middlewareLink;
  };

  const getPluginUser = (pluginId = 1) => {
    fetch(`/plugin/${pluginId}/user`)
      .then(res => res.json())
      .then(data => {
        console.log(data);
      });
  };

  let script = null;
  let rand = Math.floor(Math.random() * 1000);

  const loadPlugin = (pluginLink) => {
    setShowPluginOptions(false);
    if (script) {
      document.head.removeChild(script);
      setLoaded(false);
    }
    if (pluginLink) {
      const target = `sefaria-plugin-${rand}`;
      setPluginName(target);
      script = document.createElement('script');
      script.src = repoToRawLink(pluginLink, target);
      script.async = true;
      script.onload = () => {
        setLoaded(true);
        addEventListenerToPlugin(target);
      };
      document.head.appendChild(script);
    }

    getPluginUser();
  };

  const addEventListenerToPlugin = (target) => {
    const pluginElement = document.querySelector(target);
    if (pluginElement) {
      pluginElement.addEventListener('scrollToRef', (event) => {
        scrollToRef(event.detail.sref);
      });
    }
  };

  const scrollToRef = (sref) => {
    if (sref) {
      const query = `div[data-ref="${sref}"]`;
      const element = document.querySelectorAll(query)[0];
      if (element) {
        element.scrollIntoView();
        element.parentElement.parentElement.parentElement.parentElement.parentElement.scrollBy(0, -40);
      }
    }
  };

  if (loaded) {
    const PluginElm = pluginName;
    return (
      <div>
        {isDeveloper && <button onClick={() => loadPlugin(link)}>Reload Plugin</button> }
        <PluginElm sref={sref} scrollToRef={scrollToRef} />
      </div>
    );
  }
  else if (isDeveloper) {
    return (
      <div>
        <input
          type="text"
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: 0,
            textAlign: 'inherit',
            background: '#EDEDEC',
            borderRadius: '250px',
            width: '140px',
            height: '30px',
            border: 0,
            paddingLeft: '10px'
          }}
          placeholder="Enter script link"
          value={link}
          onChange={(e) => setLink(e.target.value)}
        />
        <button className='button' style={{width: '100%', marginTop: '18px'}} onClick={() => loadPlugin(link)}>Pull</button>
      </div>
    );
  }
  else {
    return (  
      <div>
      <p style={{fontSize: '16px', color: '#666', fontWeight: 500, lineHeight: '26px'}}>Loading...</p>
      </div>
    );
  }
}

export default WebComponentLoader;
