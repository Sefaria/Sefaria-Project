import React, {useState} from 'react';
import {Editor} from 'slate-react'
import {Block, Value} from 'slate'
import Html from 'slate-html-serializer'

const {
    SheetMetaDataBox,
    SheetAuthorStatement,
    SheetTitle,

} = require('./Misc');


// Add a dictionary of mark tags.
const MARK_TAGS = {
    em: 'italic',
    strong: 'bold',
    b: 'bold',
    u: 'underline',
}

const BLOCK_TAGS = {
    blockquote: 'block-quote',
    p: 'paragraph',
    ul: 'bulleted-list',
    li: 'list-item',
    ol: 'numbered-list',
    h1: 'heading-one',
    h2: 'heading-two'
}


export const rules = [
    {
        deserialize(el, next) {
            const type = BLOCK_TAGS[el.tagName.toLowerCase()]
            if (type) {
                return {
                    object: 'block',
                    type: type,
                    nodes: next(el.childNodes),
                }
            }
        },
        serialize(obj, children) {
            if (obj.object == 'block') {
                switch (obj.type) {
                    case 'paragraph':
                        return <p>{children}</p>
                    case 'block-quote':
                        return <blockquote>{children}</blockquote>
                    case 'bulleted-list':
                        return <ul>{children}</ul>
                    case 'heading-one':
                        return <h1>{children}</h1>
                    case 'heading-two':
                        return <h2>{children}</h2>
                    case 'list-item':
                        return <li>{children}</li>
                    case 'numbered-list':
                        return <ol>{children}</ol>
                }
            }
        },
    },
// Add a new rule that handles marks...
    {
        deserialize(el, next) {
            const type = MARK_TAGS[el.tagName.toLowerCase()]
            if (type) {
                return {
                    object: 'mark',
                    type: type,
                    nodes: next(el.childNodes),
                }
            }
        },
        serialize(obj, children) {
            if (obj.object == 'mark') {
                switch (obj.type) {
                    case 'bold':
                        return <strong>{children}</strong>
                    case 'italic':
                        return <em>{children}</em>
                    case 'underlined':
                        return <u>{children}</u>
                    case 'code':
                        return <code>{children}</code>
                }
            }
        },
    },
]

const html = new Html({rules})

function SefariaEditor(props) {

    function transformSheetJsonToDraft(sheet) {

        return (
            {
                "object": "value",
                "document": {
                    "object": "document",
                    "nodes": [
                        {
                            "object": "block",
                            "type": "SheetMetaDataBox",
                            "nodes": [
                                {
                                    "object": "inline",
                                    "type": "SheetTitle",
                                    "data": {
                                      "title": sheet.title
                                    },
                                    "nodes": [
                                        {
                                            "object": "text",
                                            "text": "banana",
                                        }
                                    ]
                                },
                                {
                                    "object": "inline",
                                    "type": "SheetAuthorStatement",
                                    "data": {
                                      "authorImage": sheet.ownerImageUrl,
                                      "authorUrl": sheet.ownerProfileUrl,
                                      "authorStatement": sheet.ownerName,
                                    },

                                    "nodes": [
                                        {
                                            "object": "text",
                                            "text": "potato",
                                        }
                                    ]
                                }
                            ]
                        },
                        {
                            "object": "block",
                            "type": "paragraph",
                            "nodes": [
                                {
                                    "object": "text",
                                    "text": "",
                                }
                            ]
                        },


                    ]
                }
            }
        )
    }


    const initialValue = Value.fromJSON(transformSheetJsonToDraft(props.data))
    const schema = {
        document: {
            nodes: [
                {match: {type: 'SheetMetaData'}, min: 1, max: 1},
                {match: {type: 'paragraph'}, min: 1},
            ],
            normalize: (editor, {code, node, child, index}) => {
                switch (code) {
                    case 'child_type_invalid': {
                        const type = index === 0 ? 'title' : 'paragraph'
                        return editor.setNodeByKey(child.key, type)
                    }
                    case 'child_min_invalid': {
                        const block = Block.create(index === 0 ? 'title' : 'paragraph')
                        return editor.insertNodeByKey(node.key, index, block)
                    }
                }
            },
        },
    }

    function onKeyDown(event, editor, next) {
        return next()
    }

    function renderBlock(props, editor, next) {
        switch (props.node.type) {
            case 'paragraph':
                return (
                    <p {...props.attributes}>
                        {props.children}
                    </p>
                )
            case 'title':
                return (
                    <div {...props.attributes} className="title" role="heading" aria-level="1">{props.children}</div>
                )
            case 'SheetMetaDataBox':
                return (
                    <SheetMetaDataBox>{props.children}</SheetMetaDataBox>
                )
            default:
                return next()
        }
    }

    // Add a `renderMark` method to render marks.
    function renderMark(props, editor, next) {
        const {mark, attributes} = props
        switch (mark.type) {
            case 'bold':
                return <strong {...attributes}>{props.children}</strong>
            case 'italic':
                return <em {...attributes}>{props.children}</em>
            case 'underline':
                return <u {...attributes}>{props.children}</u>
            default:
                return next()
        }
    }

    function renderInline(props, editor, next) {
        const { attributes, children, node } = props
        const { data } = node
        switch (node.type) {
            case 'SheetAuthorStatement':
                const authorUrl = data.get('authorUrl')
                const authorImage = data.get('authorImage')
                const authorStatement = data.get('authorStatement')
                return (
                    <SheetAuthorStatement
                        authorUrl={authorUrl}
                        authorImage={authorImage}
                        authorStatement={authorStatement}
                    />
                )
            case 'SheetTitle':
                const title = data.get('title')
                return (
                    <SheetTitle title={title} />
                )
            default:
                return next()
        }
    }


    return (
        <Editor
            onKeyDown={(event, editor, next) => onKeyDown(event, editor, next)}
            defaultValue={initialValue}
            renderBlock={(props, editor, next) => renderBlock(props, editor, next)}
            renderMark={(props, editor, next) => renderMark(props, editor, next)}
            renderInline={(props, editor, next) => renderInline(props, editor, next)}
        />
    )


}


module.exports = SefariaEditor;
