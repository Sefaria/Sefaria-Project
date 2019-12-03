import React, {useCallback, useMemo, useState, useEffect, useRef} from 'react';
import {jsx} from 'slate-hyperscript'
import {withHistory} from 'slate-history'
import {withSchema} from 'slate-schema'
import {Editor, createEditor, Range} from 'slate'
import {Slate, Editable, ReactEditor, withReact, useSlate} from 'slate-react'


import Sefaria from './sefaria/sefaria';

import {
    SheetMetaDataBox,
    SheetAuthorStatement,
    SheetTitle,
    GroupStatement,
    ProfilePic,
} from './Misc';

import classNames from 'classnames';
import $ from "./sefaria/sefariaJquery";

const initialValue = [
    {
        type: 'mooo',
        children: [
            {
                text: '',
                marks: [],
            },
        ],
    },
]


const Element = ({attributes, children, element}) => {
    switch (element.type) {
        case 'title':
            return <h2 {...attributes}>{children}</h2>
        case 'paragraph':
            return <p {...attributes}>{children}</p>
        default:
            return <p {...attributes}>{children}</p>

    }
}


const withMarks = editor => {
    const {exec} = editor

    editor.exec = command => {
        switch (command.type) {
            case 'toggle_mark': {
                const {mark} = command
                const isActive = isMarkActive(editor, mark.type)
                const cmd = isActive ? 'remove_mark' : 'add_mark'
                editor.exec({type: cmd, mark})
                break
            }

            default: {
                exec(command)
                break
            }
        }
    }

    return editor
}


const isMarkActive = (editor, type) => {
    const [mark] = Editor.marks(editor, { match: { type }, mode: 'all' })
    return !!mark
};

const Mark = ({attributes, children, mark}) => {
    switch (mark.type) {
        case 'bold':
            return <strong {...attributes}>{children}</strong>
        case 'italic':
            return <em {...attributes}>{children}</em>
        case 'underline':
            return <u {...attributes}>{children}</u>
    }
}

const HoverMenu = () => {
    const ref = useRef();
    const editor = useSlate();

    useEffect(() => {
        const el = ref.current;
        const {selection} = editor;

        if (!el) {
            return
        }

        if (
            !selection ||
            !ReactEditor.isFocused(editor) ||
            Range.isCollapsed(selection) ||
            Editor.text(editor, selection) === ''
        ) {
            el.removeAttribute('style');
            return
        }

        const domSelection = window.getSelection()
        const domRange = domSelection.getRangeAt(0)
        const rect = domRange.getBoundingClientRect()
        el.style.opacity = 1
        el.style.top = `${rect.top + window.pageYOffset - el.offsetHeight}px`

        el.style.left = `${rect.left +
        window.pageXOffset -
        el.offsetWidth / 2 +
        rect.width / 2}px`

    })

    const root = window.document.getElementById('s2')
    return ReactDOM.createPortal(
        <div ref={ref} className="hoverMenu">
            <MarkButton editor={editor} type="bold"/>
            <MarkButton editor={editor} type="italic"/>
            <MarkButton editor={editor} type="underline"/>
        </div>,
        root
    )
};

const MarkButton = ({type}) => {
    const editor = useSlate()

    const isActive = isMarkActive(editor, type)
    const iconName = "fa-" + type;
    const classes = {fa: 1, active: isActive};
    classes[iconName] = 1;

    return (
        <span className="markButton"
              onMouseDown={event => {
                  event.preventDefault()
                  editor.exec({type: 'toggle_mark', mark: {type}})
              }}
        >
      <i className={classNames(classes)}/>
    </span>
    )


}

    const SefariaEditor = () => {

        const renderElement = useCallback(props => <Element {...props} />, [])

        const beforeInput = event => {
            switch (event.inputType) {
                case 'formatBold':
                    return editor.exec({type: 'toggle_mark', mark: 'bold'})
                case 'formatItalic':
                    return editor.exec({type: 'toggle_mark', mark: 'italic'})
                case 'formatUnderline':
                    return editor.exec({type: 'toggle_mark', mark: 'underline'})
            }
        }

        const editor = useMemo(
            () => withMarks(withHistory(withReact(createEditor()))),
            []
        )

        return (
            // Add the editable component inside the context.
            <Slate editor={editor} defaultValue={initialValue}>
                <HoverMenu/>

                <Editable
                    renderMark={props => <Mark {...props} />}
                    renderElement={renderElement}
                    placeholder="Enter a title…"
                    spellCheck
                    onDOMBeforeInput={beforeInput}

                />
            </Slate>
        )
    }

    export default SefariaEditor;
