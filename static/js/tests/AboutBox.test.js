import React from 'react';
import { render, waitFor, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AboutBox from '../AboutBox';

const getCurrObjectVersions = async (ref, masterPanelLanguage) => {
    const data = await Sefaria.getText(ref, {context: 1});
    return {
        en: Sefaria.getVersionFromData(data, "en", masterPanelLanguage),
        he: Sefaria.getVersionFromData(data, "he", masterPanelLanguage),
    }
}

const aboutTest = async (title, sectionRef, masterPanelLanguage, authorName, authorUrlRegex) => {
    const currObjectVersions = await getCurrObjectVersions(sectionRef, masterPanelLanguage);
    render(
        <AboutBox
            currObjectVersions={currObjectVersions}
            masterPanelLanguage={masterPanelLanguage}
            title={title}
            srefs={[sectionRef]}
            sectionRef={sectionRef}
        />
    );
    await waitFor(() => screen.getByText("About This Text"));
    if (masterPanelLanguage != "english") {
        screen.getByText("Current Version");
    }
    if (masterPanelLanguage != "hebrew") {
        screen.getByText("Current Translation");
    }
    if (!authorName) {
        expect(screen.queryByText("Author:")).not.toBeInTheDocument();
    } else {
        screen.getByText("Author:");
        const link = screen.getByText(authorName);
        expect(link.href).toMatch(authorUrlRegex)        
    }
}
it('has bilingual versions', async () => {
    const title = "Job"
    const sectionRef = `${title} 1`;
    const masterPanelLanguage = "bilingual"
    await aboutTest(title, sectionRef, masterPanelLanguage);
});

it('has english version', async () => {
    const title = "Job";
    const sectionRef = `${title} 1`;
    const masterPanelLanguage = "english"
    await aboutTest(title, sectionRef, masterPanelLanguage);
});

it('has hebrew version', async () => {
    const title = "Job";
    const sectionRef = `${title} 1`;
    const masterPanelLanguage = "hebrew";
    await aboutTest(title, sectionRef, masterPanelLanguage);
});

it('has author', async () => {
    const title = "Orot";
    const sectionRef = `${title}, Lights from Darkness, Land of Israel 1`;
    const masterPanelLanguage = "hebrew";
    await aboutTest(title, sectionRef, masterPanelLanguage, 'Avraham Yitzchak HaCohen Kook', /topics\/avraham-yitzchak-hacohen-kook$/);
});