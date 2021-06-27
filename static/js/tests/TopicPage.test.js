import { render, waitFor, screen } from '@testing-library/react';
import { renderAppByUrl } from './testUtils';

it('render', async () => {
    renderAppByUrl('/topics', ['lot']);
    await waitFor(() => screen.getByText("Lot"));
    await waitFor(() => screen.getByText('Genesis 13:10-11'))
})