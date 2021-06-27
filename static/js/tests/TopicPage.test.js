import { render, waitFor, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAppByUrl } from './testUtils';

const filterByText = (text) => {
    userEvent.click(screen.getByText("Filter"));  // open filter menu
    const filterInput = within(screen.getByTestId('filter-header')).getByPlaceholderText('Search');
    userEvent.clear(filterInput);
    userEvent.type(filterInput, text);
    userEvent.click(screen.getByText("Filter"));  // close filter menu
}

it('filters', async () => {
    const nonsenseTextToFilterBy = 'dfdfdfdfjkjkjdkfjdjfs';
    const topRef = "Genesis 13:10-11";
    const topSheet = "Ruth the Moabite";
    const bottomRef = "Leviticus 8:23";
    const bottomSheet = "בנות לוט";
    renderAppByUrl('/topics', 'lot');
    await waitFor(() => screen.getByRole('heading', {name: "Lot"}));
    await waitFor(() => screen.getByText(topRef));
    filterByText(nonsenseTextToFilterBy);
    expect(screen.queryByText(topRef)).not.toBeInTheDocument();

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
})