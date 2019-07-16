import React, {useState} from 'react';
import {Editor} from 'slate-react'
import {Block, Value, Data} from 'slate'
import Html from 'slate-html-serializer'
import PlaceholderPlugin from 'slate-react-placeholder'

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

    const plugins = [
        {
            queries: {
                isEmpty: editor => editor.value.document.text === '',
            },
        },
        PlaceholderPlugin({
            placeholder:
                'Untitled Source Sheet',
            when: 'isEmpty',
            style: {color: '#333'},
        }),
    ]

    function transformSheetJsonToDraft(sheet) {
        const sheetTitle = sheet.title.stripHtmlKeepLineBreaks();
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
                                    "object": "block",
                                    "type": "SheetTitle",
                                    "data": {
                                        "title": sheetTitle
                                    },
                                    "nodes": [
                                        {
                                            "object": "text",
                                            "text": sheetTitle,
                                        }
                                    ]
                                },
                                {
                                    "object": "block",
                                    "type": "SheetAuthorStatement",
                                    "data": {
                                        "authorImage": sheet.ownerImageUrl,
                                        "authorUrl": sheet.ownerProfileUrl,
                                        "authorStatement": sheet.ownerName,
                                    },

                                    "nodes": [
                                        {
                                            "object": "text",
                                            "text": sheet.ownerName,
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
                                    "text": "w00t",
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
                {match: {type: 'SheetMetaDataBox'}, min: 1, max: 1},
                {match: {type: 'paragraph'}, min: 1},
            ],
            normalize: (editor, {code, node, child, index}) => {
                console.log("doc:", code, index)
                switch (code) {
                    case 'child_type_invalid': {
                        const type = index === 0 ? 'SheetMetaDataBox' : 'paragraph'
                        return editor.setNodeByKey(child.key, type)
                    }
                    case 'child_min_invalid': {
                        const block = Block.create(index === 0 ? 'SheetMetaDataBox' : 'paragraph')
                        return editor.insertNodeByKey(node.key, index, block)
                    }
                }
            },
        },
       blocks: {
            SheetMetaDataBox: {
                nodes: [
                    {
                        match: {type: 'SheetTitle', min: 1, max: 1}
                    },
                    {
                        match: {type: 'SheetAuthorStatement', min: 1, max: 1}
                    },
                ],
                normalize: (editor, {code, node, child, index}) => {
                    console.log("block:", code, index)

                    switch (code) {
                        case 'child_type_invalid': {
                            console.log(getNode(child.key).toJSON())
                            return null
                        }
                        case 'child_min_invalid': {

                            const block = Block.create(index === 0 ? 'SheetTitle' : 'SheetAuthorStatement')
                            return editor.insertNodeByKey(node.key, index, block)
                        }
                    }
                },

            },
            paragraph: {
                nodes: [
                    {
                        match: {object: 'text'},
                    },
                ],
            },
            SheetTitle: {
                nodes: [
                    {
                        match: {object: 'text'},
                    },
                ],
                  data: {
                    title: v => v,
      },
            },

        },


    }

    function onKeyDown(event, editor, next) {
        return next()
    }

    function renderBlock(props, editor, next) {
        const { attributes, children, node } = props
        const { data } = node

        switch (node.type) {
            case 'paragraph':
                return (
                    <p {...attributes}>
                        {children}
                    </p>
                )
            case 'title':
                return (
                    <div {...attributes} className="title" role="heading" aria-level="1">{children}</div>
                )
            case 'SheetMetaDataBox':
                return (
                    <SheetMetaDataBox>{children}</SheetMetaDataBox>
                )
            case 'SheetAuthorStatement':
                const authorUrl = data.get('authorUrl')
                const authorImage = data.get('authorImage')
                const authorStatement = data.get('authorStatement')
                return (
                    <SheetAuthorStatement
                        authorUrl={authorUrl}
                        authorImage={authorImage}
                        authorStatement={authorStatement}
                        schema={schema}
                    >{children}</SheetAuthorStatement>
                )
            case 'SheetTitle':
                const title = data.get('title')
                return (
                    <SheetTitle {...attributes} title={title}>{children}</SheetTitle>
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
                        schema={schema}
                    >{children}</SheetAuthorStatement>
                )
            case 'SheetTitle':
                const title = data.get('title')
                return (
                    <SheetTitle {...attributes} title={title}>{children}</SheetTitle>
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
            plugins={plugins}
            schema={schema}
        />
    )


}


module.exports = SefariaEditor;
