import React from 'react';
import { render, fireEvent, waitFor, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Footer from '../Footer';
jest.mock('../sefaria/sefaria');

const addScriptToBody = () => {
    const body = document.getElementsByTagName('body')[0]
    const script = document.createElement('script');
    body.appendChild(script);
}
it('blah', () => {
    addScriptToBody();
    render(<Footer />);
    const input = screen.getByPlaceholderText("Sign up for Newsletter");
    userEvent.type(input, 'test@blah.com');
});