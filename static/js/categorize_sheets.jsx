class Categorizer extends React.Component {
  render() {
    return (
        <div className="categorizer">
            <div id="edit-pane">
              Left pane
            </div>
            <div id="iframeContainer">
                <iframe class="sheet" src="../sheets/1234"></iframe>
            </div>
        </div>
    );
  }
}
ReactDOM.render(<Categorizer/>, document.getElementById('content'));
