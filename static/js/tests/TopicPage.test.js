import { render, waitFor, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAppByUrl, waitForLinkDot } from './testUtils';

const lotTopRef = "Genesis 13:10-11";

const filterByText = (text) => {
    userEvent.click(screen.getByText("Filter"));  // open filter menu
    const filterInput = within(screen.getByTestId('filter-header')).getByPlaceholderText('Search');
    userEvent.clear(filterInput);
    userEvent.type(filterInput, text);
    userEvent.click(screen.getByText("Filter"));  // close filter menu
}

it('filters', async () => {
    const nonsenseTextToFilterBy = 'dfdfdfdfjkjkjdkfjdjfs';
    const topSheet = "Ruth the Moabite";
    const bottomRef = "Leviticus 8:23";
    const bottomSheet = "בנות לוט";
    renderAppByUrl('/topics', 'lot');
    await waitFor(() => screen.getByRole('heading', {name: "Lot"}));
    await waitFor(() => screen.getByText(lotTopRef));
    filterByText(nonsenseTextToFilterBy);
    expect(screen.queryByText(lotTopRef)).not.toBeInTheDocument();

    expect(screen.queryByText(bottomRef)).not.toBeInTheDocument();
    filterByText(bottomRef);
    await waitFor(() => screen.getByText(bottomRef));

    userEvent.click(screen.getByText("Sheets"));
    await waitFor(() => screen.getByText(topSheet));
    filterByText(nonsenseTextToFilterBy);
    expect(screen.queryByText(topSheet)).not.toBeInTheDocument();

    expect(screen.queryByText(bottomSheet)).not.toBeInTheDocument();
    filterByText(bottomSheet);
    await waitFor(() => screen.getByText(bottomSheet));
});

it('can navigate in sidebar back and forth', async () => {

    const haranTopRef = "Genesis 11:27";

    renderAppByUrl('/topics', 'lot');
    await waitFor(() => screen.getByText('Haran'));
    userEvent.click(screen.getByText("Haran"));
    await waitFor(() => screen.getByRole('heading', {name: "Haran"}));
    await waitFor(() => screen.getByText(haranTopRef))

    userEvent.click(screen.getByText("Lot"));
    await waitFor(() => screen.getByRole('heading', {name: "Lot"}));
    await waitFor(() => screen.getByText(lotTopRef));
});

it('can navigate to biblical figures', async () => {
    const achanTopRef = "Joshua 7:19-22";

    renderAppByUrl('/topics', 'lot');
    await waitFor(() => screen.getByText('Biblical Figures'));
    userEvent.click(screen.getByText('Biblical Figures'));
    await waitFor(() => screen.getByText('Biblical Figures'));
    userEvent.click(screen.getByText("Achan"));
    await waitFor(() => screen.getByRole('heading', {name: "Achan"}));
    await waitFor(() => screen.getByText(achanTopRef));
});

describe('parasha topic', () => {
    const topTzavPasuk = "Leviticus 7:11-12";
    it('can click read the portion', async () => {
        renderAppByUrl('/topics', 'parashat-tzav');
        await waitFor(() => screen.getByText(topTzavPasuk));
        userEvent.click(screen.getByText("Read the Portion"));
        await waitForLinkDot();
    });

    it('has parasha sidebar data', async () => {
        renderAppByUrl('/topics', 'parashat-tzav');
        await waitFor(() => screen.getByText(topTzavPasuk));
        const readings = screen.getByTestId('readings-component');
        within(readings).getByText('Torah');
        within(readings).getByText('Haftarah');
        userEvent.click(within(readings).getByText('Leviticus 6:1-8:36'));
    });

    it('can click parasha sidebar link', async () => {
        renderAppByUrl('/topics', 'parashat-tzav');
        await waitFor(() => screen.getByText(topTzavPasuk));
        const readings = screen.getByTestId('readings-component');
        userEvent.click(within(readings).getByText('Leviticus 6:1-8:36'));
        await waitForLinkDot();
    });

    it('can click haftarah sidebar links', async () => {
        renderAppByUrl('/topics', 'parashat-tzav');
        await waitFor(() => screen.getByText(topTzavPasuk));
        const readings = screen.getByTestId('readings-component');

        // assert existence of both haftarah links
        for (let ihaftarahLink of [0, 1]) {
            userEvent.click(within(readings).getByTestId(`readings-haftarah-link-${ihaftarahLink}`));
            await waitForLinkDot();
        }
    });
});

describe('author topic', () => {
    it('has indexes listed', async () => {
        renderAppByUrl('/topics', 'rashi');
        await waitFor(() => screen.getByRole('heading', {name: "Rashi"}));
        await waitFor(() => screen.getByText('Works on Sefaria'));
        userEvent.click(screen.getByText('Rashi on Tanakh'));
        await waitFor(() => screen.getByRole('heading', {name: /Rashi/}));
    });

    it('has lived', async () => {
        renderAppByUrl('/topics', 'rashi');
        await waitFor(() => screen.getByText('Lived'));
    });
});