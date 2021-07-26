const getMessage = () => "Hello World!!!! THIS WORKS";
  document.getElementById("output").innerHTML = getMessage();
  class App extends React.Component {
  render() {
    return (
        <div className='app'>
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
ReactDOM.render(<App/>, document.getElementById('categorizer'));
