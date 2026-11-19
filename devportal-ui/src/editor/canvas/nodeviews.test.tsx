// Node views: each construct shows as on the public page, its settings change the document, and the changes are
// written back as the C4 dialect.
import '../test/dom';
import type { Editor } from '@tiptap/core';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { parseMarkdown } from '../markdown/parse';
import { serializeMarkdown } from '../markdown/serialize';
import { Canvas } from './Canvas';
import { EditorServicesContext } from './services';

const SOURCE = [
  '<Callout icon="🚧" theme="warn">',
  'Careful.',
  '</Callout>',
  '',
  '<Image src="https://storage.googleapis.com/b/developers/a.png" alt="Diagram" />',
  '',
  '```python Example',
  'print(1)',
  '```',
  '',
  '<Embed url="https://www.youtube.com/watch?v=JUSW7y4wYUQ" title="Talk" />',
  '',
  '<HTMLBlock>{`<style>p{color:red}</style><p onclick="x()">Hi</p><script>alert(1)</script>`}</HTMLBlock>',
  '',
  '<div onclick="alert(2)">Raw <b>HTML</b><script>alert(3)</script></div>',
  '',
].join('\n');

async function setup(upload = vi.fn()) {
  let editor: Editor | null = null;
  const view = render(
    <EditorServicesContext.Provider value={{ upload }}>
      <Canvas content={parseMarkdown(SOURCE)} label="Body" onReady={(e) => (editor = e)} />
    </EditorServicesContext.Provider>
  );
  // React node views mount after the editor.
  await waitFor(() => expect(view.container.querySelector('[class*="rawPreview"]')).not.toBeNull());
  return { view, editor: () => editor!, upload };
}

function block(editor: Editor, type: string) {
  let found: Record<string, unknown> | null = null;
  editor.state.doc.forEach((n) => {
    if (n.type.name === type && !found) found = n.attrs;
  });
  return found as unknown as Record<string, unknown>;
}

describe('node views', () => {
  it('opens every block clean: saving without edits returns the source', async () => {
    const { editor } = await setup();
    expect(serializeMarkdown(editor().state.doc)).toBe(SOURCE);
  });

  it('callout: shows the icon and theme, and changes them', async () => {
    const { view, editor } = await setup();
    const callout = view.container.querySelector('blockquote.dp-callout')!;
    expect(callout).toHaveClass('dp-callout-warn');
    expect(within(callout as HTMLElement).getByText('🚧')).toHaveClass('dp-callout-icon');
    const group = screen.getByRole('group', { name: 'Callout settings' });
    await act(async () => {
      fireEvent.change(within(group).getByLabelText('Theme'), { target: { value: 'error' } });
    });
    expect(block(editor(), 'callout')).toMatchObject({ theme: 'error', icon: '❗️' });
    expect(view.container.querySelector('blockquote.dp-callout')).toHaveClass('dp-callout-error');
    expect(serializeMarkdown(editor().state.doc)).toContain('<Callout icon="❗️" theme="error">\nCareful.\n</Callout>');
  });

  it('image: alignment, width, caption and border, and the upload', async () => {
    const upload = vi.fn().mockResolvedValue({
      contractVersion: 1,
      created: true,
      asset: {
        id: 1,
        url: 'https://storage.googleapis.com/b/developers/abc-new.png',
        contentType: 'image/png',
        size: 9,
        width: 1,
        height: 1,
        sha256: 'x',
      },
    });
    const { view, editor } = await setup(upload);
    const img = view.container.querySelector('img.dp-img') as HTMLImageElement;
    expect(img).toHaveAttribute('alt', 'Diagram');
    const group = screen.getByRole('group', { name: 'Image settings' });
    await act(async () => {
      fireEvent.change(within(group).getByLabelText('Align'), { target: { value: 'center' } });
      fireEvent.change(within(group).getByLabelText('Width'), { target: { value: '70%' } });
      fireEvent.change(within(group).getByLabelText('Caption'), { target: { value: 'A caption' } });
      fireEvent.click(within(group).getByLabelText('Border'));
    });
    expect(block(editor(), 'dpImage')).toMatchObject({
      align: 'center',
      width: '70%',
      caption: 'A caption',
      border: true,
    });
    expect(view.container.querySelector('figure.dp-figure figcaption')).toHaveTextContent('A caption');
    expect(view.container.querySelector('img.dp-img')).toHaveClass('dp-img-align-center', 'dp-img-border');

    const file = new File([new Uint8Array([137, 80, 78, 71])], 'new.png', { type: 'image/png' });
    await userEvent.upload(within(group).getByLabelText('Upload'), file);
    expect(upload).toHaveBeenCalledWith(file);
    expect(block(editor(), 'dpImage')).toMatchObject({
      src: 'https://storage.googleapis.com/b/developers/abc-new.png',
    });
    expect(serializeMarkdown(editor().state.doc)).toContain(
      '<Image src="https://storage.googleapis.com/b/developers/abc-new.png" alt="Diagram" align="center" width="70%" caption="A caption" border={true} />'
    );
  });

  it('code block: language and tab title', async () => {
    const { view, editor } = await setup();
    expect(view.container.querySelector('.dp-codetabs-tab')).toHaveTextContent('Example');
    const group = screen.getByRole('group', { name: 'Code block settings' });
    await act(async () => {
      fireEvent.change(within(group).getByLabelText('Language'), { target: { value: 'json' } });
      fireEvent.change(within(group).getByLabelText('Tab title'), { target: { value: '' } });
    });
    expect(block(editor(), 'codeBlock')).toMatchObject({ language: 'json', title: '' });
    expect(view.container.querySelector('.dp-codetabs-tab')).toHaveTextContent('JSON');
    expect(serializeMarkdown(editor().state.doc)).toContain('```json\nprint(1)\n```');
  });

  it('embed: a YouTube URL becomes a youtube-nocookie frame', async () => {
    const { view, editor } = await setup();
    const frame = view.container.querySelector('iframe.dp-embed-iframe')!;
    expect(frame).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/JUSW7y4wYUQ');
    const group = screen.getByRole('group', { name: 'Embed settings' });
    await act(async () => {
      fireEvent.change(within(group).getByLabelText('URL'), { target: { value: 'https://youtu.be/abcdefghijk' } });
    });
    expect(block(editor(), 'embed')).toMatchObject({ url: 'https://youtu.be/abcdefghijk' });
    expect(view.container.querySelector('iframe.dp-embed-iframe')).toHaveAttribute(
      'src',
      'https://www.youtube-nocookie.com/embed/abcdefghijk'
    );
  });

  it('HTML block: a source editor and a preview frame that can run no script', async () => {
    const { view, editor } = await setup();
    const frame = view.container.querySelector('iframe.dp-htmlblock-frame')!;
    expect(frame.getAttribute('sandbox')).toBe('');
    expect(frame.getAttribute('srcdoc')).toContain('<p onclick="x()">Hi</p>');
    const group = screen.getByRole('group', { name: 'HTML block' });
    await act(async () => {
      fireEvent.change(within(group).getByLabelText('HTML'), { target: { value: '<p>New</p>' } });
    });
    expect(block(editor(), 'dpHtmlBlock')).toMatchObject({ html: '<p>New</p>' });
    expect(serializeMarkdown(editor().state.doc)).toContain('<HTMLBlock>{`<p>New</p>`}</HTMLBlock>');
  });

  it('raw HTML is shown through the C4 sanitizer', async () => {
    const { view } = await setup();
    const raw = view.container.querySelector('[class*="rawPreview"]')!;
    expect(raw.innerHTML).toBe('<div>Raw <b>HTML</b></div>\n');
  });

  it('has no axe violations', async () => {
    const { view } = await setup();
    // Frames are checked by their own pages; jsdom cannot host axe inside them.
    expect(await axe(view.container, { iframes: false })).toHaveNoViolations();
  });
});
