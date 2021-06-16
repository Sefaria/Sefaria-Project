import React from 'react';
import { rest } from 'msw';
import { setupServer } from 'msw/node';
import { render, fireEvent, waitFor, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NewsletterSignUpForm } from '../../Misc';
import Sefaria from '../../sefaria/sefaria';

Sefaria.interfaceLang = "english";
const server = setupServer(
    rest.post('/api/subscribe/:email', (req, res, ctx) => {
        return res(ctx.json({success: true}))
    })
)
beforeAll(() => {
    server.listen()
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const inputTest = async (props, email, waitForMessages) => {
    render(<NewsletterSignUpForm {...props} />);
    const input = screen.getByPlaceholderText("Sign up for Newsletter");
    userEvent.type(input, email);
    userEvent.click(screen.getByTestId('subscribeSubmit'));
    for (let message of waitForMessages) {
        await waitFor(() => screen.getByText(message));
    }
} 
it('invalid email in newsletter form', async () => {
    await inputTest({contextName: "Footer"}, 'invalid email', ['Please enter a valid email address.']);
});

it('valid email in newsletter form', async () => {
    await inputTest({contextName: "Footer"}, 'test@fakedomain.com', ['Subscribing...', 'Subscribed! Welcome to our list.']);
});

it('valid email in newsletter form with 500 response', async () => {
    server.use(
        rest.post('/api/subscribe/:email', (req, res, ctx) => {
            return res(ctx.status(500))
        })
    );
    await inputTest({contextName: "Footer"}, 'test@fakedomain.com', ['Subscribing...', 'Sorry, there was an error.']);
});

it('valid email in newsletter form with error response', async () => {
    const errorMessage = "test error message";
    server.use(
        rest.post('/api/subscribe/:email', (req, res, ctx) => {
            return res(ctx.json({error: errorMessage}))
        })
    );
    await inputTest({contextName: "Footer"}, 'test@fakedomain.com', ['Subscribing...', errorMessage]);
});