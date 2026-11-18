// Minimal types for the parts of CodeMirror 5 the highlighter uses (runMode only).
declare module 'codemirror' {
  type RunModeCallback = (text: string, style: string | null | undefined) => void;
  interface CodeMirrorStatic {
    runMode(text: string, mode: string | Record<string, unknown>, callback: RunModeCallback): void;
    findModeByName?(name: string): { mode: string; mime?: string } | undefined;
    modes: Record<string, unknown>;
  }
  const CodeMirror: CodeMirrorStatic;
  export default CodeMirror;
}

declare module 'codemirror/addon/runmode/runmode.js';
declare module 'codemirror/mode/*';
