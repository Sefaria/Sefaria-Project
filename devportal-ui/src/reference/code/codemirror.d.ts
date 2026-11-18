// Minimal typing for CodeMirror 5 as the reference UI uses it: the default export carries runMode once
// codemirror/addon/runmode/runmode.js (or runmode.node.js under Node) has loaded. See highlight.ts.
declare module 'codemirror' {
  const CodeMirror: unknown;
  export default CodeMirror;
}
