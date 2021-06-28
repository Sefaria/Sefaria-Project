import { render, waitFor, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAppByUrl } from './testUtils';

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

it('can render parasha topic', async () => {
    renderAppByUrl('/topics', 'parashat-tzav');
    await waitFor(() => screen.getByText("Leviticus 7:11-12"));
    userEvent.click(screen.getByText("Read the Portion"));
    await waitFor(() => screen.getAllByTitle(/Connections Available/))
});