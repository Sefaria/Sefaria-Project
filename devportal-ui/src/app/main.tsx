// The single Vite entry (PLAN §2.8). Global styles load here so the manifest lists them as the entry's CSS.
import '../styles/tokens.css';
import '../styles/readme-tokens.css';
import '../styles/article.css';
import './fonts.css';
import './base.css';
import { mount } from './mount';

// The staff editor is its own lazy chunk; only /editor pages carry its root element.
if (document.getElementById('dp-editor-root')) {
  void import('../editor').then((m) => m.mountEditor(document));
} else {
  mount(document);
}
