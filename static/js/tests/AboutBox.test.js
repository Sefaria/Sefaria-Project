import React from 'react';
import { render, waitFor, screen } from '@testing-library/react';
import AboutBox from '../AboutBox';

const getCurrObjectVersions = async (ref, masterPanelLanguage) => {
    const data = await Sefaria.getText(ref, {context: 1});
    return {
        en: Sefaria.getVersionFromData(data, "en", masterPanelLanguage),
        he: Sefaria.getVersionFromData(data, "he", masterPanelLanguage),
    }
}
it('has bilingual versions', async () => {
    const title = {en: "Job", he: "איוב"};
    const sectionRef = `${title.en} 1`;
    const currObjectVersions = await getCurrObjectVersions(sectionRef, "bilingual");
    render(
        <AboutBox
            currObjectVersions={currObjectVersions}
            masterPanelLanguage={"english"}
            title={title.en}
            srefs={[`${title.en} 1:1`]}
            sectionRef={sectionRef}
        />
    );
    await waitFor(() => screen.getByText("About This Text"));
    screen.getByText("Current Version");
    screen.getByText("Current Translation");
    expect(screen.queryByText("Author:")).not.toBeInTheDocument();
});

it('has english version', async () => {
    const title = {en: "Job", he: "איוב"};
    const sectionRef = `${title.en} 1`;
    const currObjectVersions = await getCurrObjectVersions(sectionRef, "english");
    render(
        <AboutBox
            currObjectVersions={currObjectVersions}
            masterPanelLanguage={"english"}
            title={title.en}
            srefs={[`${title.en} 1:1`]}
            sectionRef={sectionRef}
        />
    );
    await waitFor(() => screen.getByText("About This Text"));
    expect(screen.queryByText("Current Version")).not.toBeInTheDocument();
    screen.getByText("Current Translation");
});

it('has hebrew version', async () => {
    const title = {en: "Job", he: "איוב"};
    const sectionRef = `${title.en} 1`;
    const currObjectVersions = await getCurrObjectVersions(sectionRef, "hebrew");
    render(
        <AboutBox
            currObjectVersions={currObjectVersions}
            masterPanelLanguage={"english"}
            title={title.en}
            srefs={[`${title.en} 1:1`]}
            sectionRef={sectionRef}
        />
    );
    await waitFor(() => screen.getByText("About This Text"));
    expect(screen.queryByText("Current Translation")).not.toBeInTheDocument();
    screen.getByText("Current Version");
});