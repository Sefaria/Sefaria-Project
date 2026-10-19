/**
 * Route registry entry point. Feature registries register their routes on import, in this order
 * (first match wins); the placeholders fill in whatever names are still free so every library
 * URL renders inside the shell today.
 *
 * Feature slots (each file is owned by its agent; add routes there, not here):
 */
import './home/routes';      // `home`: /
import './browse/routes';    // `texts`, `texts-category`, `book`, `calendars`
import './reader/routes';    // `ref`: the text catch-all
import './discover/routes';  // `search`, `topics`, `topic`
import './my/routes';        // `my`: /my/*
import { registerPlaceholders } from './placeholders';

registerPlaceholders();
