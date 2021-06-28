import React from 'react';
import { render } from '@testing-library/react';
import { ReaderApp } from '../ReaderApp';
import { propsData } from '../__mocks__/data/propsData';
import Sefaria from '../sefaria/sefaria';
import DJANGO_DATA_VARS from '../__mocks__/data/data';

const addScriptToBody = () => {
    const body = document.getElementsByTagName('body')[0]
    const script = document.createElement('script');
    body.appendChild(script);
}

export const getPropsByUrl = (urlBegin, urlEnd, params) => {
    const requestValues = [urlEnd];
    if (params) {
        requestValues.push(params);
    }
    const requestKey = requestValues.map(value => JSON.stringify(value)).join("|");
    if (!propsData?.[urlBegin]?.[requestKey]) {
        console.error("Request not found in `propsData.js`. Maybe you forgot to include it in `html_view_map` of scripts/generateApiData.py?\nURL Begin:", urlBegin, '\nrequestKey:',requestKey)
    }
    return propsData[urlBegin][requestKey];
};

export const setupSefaria = (props) => {
    Sefaria.unpackDataFromProps(props);
    Sefaria.setup(DJANGO_DATA_VARS);
};

export const renderAppByUrl = (urlBegin, urlEnd, params) => {
    const props = getPropsByUrl(urlBegin, urlEnd, params);
    setupSefaria(props);
    addScriptToBody();
    render(<ReaderApp {...props}/>);
};