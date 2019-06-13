import React from 'react';
import {Editor, EditorState, RichUtils} from 'draft-js';

class SefariaEditor extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
        editorState: EditorState.createEmpty(),
        showToolbar: false,
        toolbarPosition: {x:0,y:0},
    };
    this.onChange = (editorState) => this.setState({editorState},  () => {

        var sel = window.getSelection()

        if (sel.toString().length > 0) {

            var range = sel.getRangeAt(0);
            var boundary = range.getBoundingClientRect();
            console.log(boundary)

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
    } );
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
