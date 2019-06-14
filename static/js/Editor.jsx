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
	console.log(props)
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
    var sel = window.getSelection()
    if (sel.toString().length > 0) {
        var range = sel.getRangeAt(0);
        var boundary = range.getBoundingClientRect();
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


  onBoldClick() {
    this.onChange(RichUtils.toggleInlineStyle(this.state.editorState, 'BOLD'));
  }

  onItalicClick() {
    this.onChange(RichUtils.toggleInlineStyle(this.state.editorState, 'ITALIC'));
  }

  onUnderlineClick() {
    this.onChange(RichUtils.toggleInlineStyle(this.state.editorState, 'UNDERLINE'));
  }


  render() {
    return (
        <div>
          <EditorToolbar
            onItalicClick={()=>this.onItalicClick()}
            onBoldClick={()=>this.onBoldClick()}
            onUnderlineClick={()=>this.onUnderlineClick()}
            showToolbar={this.state.showToolbar}
            toolbarPosition={this.state.toolbarPosition}
          />
          <Editor editorState={this.state.editorState} onChange={this.onChange} />
        </div>
    );
  }
}


class EditorToolbar extends React.Component {

  render() {
    return (
    <div className="editorToolbar" style={{display: this.props.showToolbar ? "block" : "none", left: this.props.toolbarPosition.x, top: this.props.toolbarPosition.y  } }
        onMouseDown={(event) => {
        event.preventDefault();
        }}
    >
        <button onClick={this.props.onBoldClick}><strong>b</strong></button>
        <button onClick={this.props.onItalicClick}><em>i</em></button>
        <button onClick={this.props.onUnderlineClick}><span style={{textDecoration: 'underline'}}>u</span></button>
    </div>

    );
  }
}

module.exports = SefariaEditor;
