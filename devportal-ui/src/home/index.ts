// src/home (PLAN §2.1, Phase 5): the homepage's CSS and its PortalPage slot. The page itself is a Django
// template (devportal/templates/devportal/home.html, home_body.html). Wiring for the Integrator:
// `PAGE_SLOTS.home = homeSlot` in src/app/routes.tsx, which also brings home.css (and the Discord
// button's CSS, used by the homepage) into the entry's CSS.
import { createElement } from 'react';
import '../discord/discord.css';
import './home.css';
import { HomePage, type HomePayload } from './HomePage';

export { HomePage, type HomePayload };

/** The server region the homepage body is adopted from (home.html: data-dp-adopt="body"). */
export const HOME_ADOPT_KEY = 'body';

/** The `home` slot of PortalPage (src/app/routes.tsx `PAGE_SLOTS.home`). */
export const homeSlot = (data: HomePayload) => createElement(HomePage, { data });
