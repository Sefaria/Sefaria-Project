import React from 'react';
import {Editor, EditorState, RichUtils, convertFromHTML, ContentState, CompositeDecorator} from 'draft-js';

  const SEFREF_REGEX = /(Genesis|Gen) [0-9][0-9]?:?[0-9]?[0-9]?/g;

  function sefrefStrategy(contentBlock, callback, contentState) {
    findWithRegex(SEFREF_REGEX, contentBlock, callback);
  }
  function findWithRegex(regex, contentBlock, callback) {
    const text = contentBlock.getText();
    let matchArr, start;
    while ((matchArr = regex.exec(text)) !== null) {
      start = matchArr.index;
      callback(start, start + matchArr[0].length);
    }
  }
  const SefRefSpan = (props) => {
    console.log(props);
    return (
      <span
        style={styles.sefref}
        data-offset-key={props.offsetKey}
      >
        {props.children}
      </span>
    );
  };

  const styles = {
    sefref: {
      color: 'rgba(98, 177, 254, 1.0)',
    },
  };



class SefariaEditor extends React.Component {


  constructor(props) {
    super(props);

    const compositeDecorator = new CompositeDecorator([
        {
            strategy: sefrefStrategy,
            component: SefRefSpan,
        },
    ]);


    //create draft.js content from html data
    const html = this.props.data;
    const blocksFromHTML = convertFromHTML(html);
    const content = ContentState.createFromBlockArray(
        blocksFromHTML.contentBlocks,
        blocksFromHTML.entityMap
      );

    this.state = {
        editorState: EditorState.createWithContent(content, compositeDecorator),
        showToolbar: false,
        toolbarPosition: {x:0,y:0},
    };

    this.onChange = (editorState) => this.setState({editorState},  () => {
        this.setToolbarPosition();
    } );
  }

  setToolbarPosition() {
    const sel = window.getSelection();
    if (sel.toString().length > 0) {
        const range = sel.getRangeAt(0);
        const boundary = range.getBoundingClientRect();
        this.setState(
            {
                "showToolbar": true,
                "toolbarPosition": {x: (boundary.width/2)+(boundary.left)-30, y: boundary.top-25}
            }
        )
    }
    else {
        this.setState(
            {
                "showToolbar": false,
            }
        )

    }


  }

  onStyleClick(style_name) {
    this.onChange(RichUtils.toggleInlineStyle(this.state.editorState, style_name));
  }

  render() {
    return (
        <div>
          <EditorToolbar
            onItalicClick={()=>this.onStyleClick("ITALIC")}
            onBoldClick={()=>this.onStyleClick("BOLD")}
            onUnderlineClick={()=>this.onStyleClick("UNDERLINE")}
            showToolbar={this.state.showToolbar}
            toolbarPosition={this.state.toolbarPosition}
          />
          <Editor editorState={this.state.editorState} onChange={this.onChange} />
        </div>
    );
  }
}



const EditorToolbar = ({showToolbar, toolbarPosition, onBoldClick, onItalicClick, onUnderlineClick}) =>
    <div className="editorToolbar" style={{display: showToolbar ? "block" : "none", left: toolbarPosition.x, top: toolbarPosition.y  } }
        onMouseDown={(event) => {
        event.preventDefault();
        }}
    >
        <button onClick={onBoldClick}><strong>b</strong></button>
        <button onClick={onItalicClick}><em>i</em></button>
        <button onClick={onUnderlineClick}><span style={{textDecoration: 'underline'}}>u</span></button>
    </div>;


module.exports = SefariaEditor;
