import React, { useReducer } from 'react';
import { render, fireEvent, waitFor, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AboutBox from '../AboutBox';

const currObjectVersions = ({ title }) => {
    return ['en', 'he'].reduce((accum, lang) => {
        accum[lang] = {
            actualLanguage: lang,
            heTitle: title.he,
            title: title.en,
            language: lang,
            license: "Copyright: JPS, 1985",
            priority: 3,
            versionTitle: "Tanakh: The Holy Scriptures, published by JPS"
        };
        return accum;
    }, {});
}
it('renders', async () => {
    const title = {en: "Job", he: "איוב"};
    render(
        <AboutBox
            currObjectVersions={currObjectVersions({title})}
            title={title.en}
            srefs={[`${title.en} 1:1`]}
            sectionRef={`${title.en} 1`}
        />
    );
    await waitFor(() => screen.getByText("About This Text"));
});