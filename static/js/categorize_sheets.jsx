const getMessage = () => "Hello World!!!! THIS WORKS";
  document.getElementById("output").innerHTML = getMessage();
  class Categorizer extends React.Component {
  render() {
    return (
        <div classname="categorizer">
            <div id="container">
            <p>ASDF</p>
            </div>
            <div id="iframeContainer">
                <iframe class="sheet" src="../sheets/1234"></iframe>
            </div>
        </div>
    );
  }
}
ReactDOM.render(<Categorizer/>, document.getElementById('content'));
