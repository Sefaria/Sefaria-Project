import React, {useState} from 'react';
import {Editor} from 'slate-react'
import {Block, Value, Data} from 'slate'
import Html from 'slate-html-serializer'

const {
    SheetMetaDataBox,
    SheetAuthorStatement,
    SheetTitle,
    GroupStatement,
    ProfilePic,
} = require('./Misc');


// Add a dictionary of mark tags.
const MARK_TAGS = {
    em: 'italic',
    strong: 'bold',
    b: 'bold',
    u: 'underline',
};

const BLOCK_TAGS = {
    blockquote: 'block-quote',
    p: 'paragraph',
    ul: 'bulleted-list',
    li: 'list-item',
    ol: 'numbered-list',
    h1: 'heading-one',
    h2: 'heading-two'
};


export const rules = [
    {
        deserialize(el, next) {
            const type = BLOCK_TAGS[el.tagName.toLowerCase()];
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
];

const html = new Html({rules})

function SefariaEditor(props) {

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
                                        "authorUrl": sheet.ownerProfileUrl,
                                        "authorStatement": sheet.ownerName,
                                    },

                                    "nodes": [
                                        {
                                            "object": "block",
                                            "type": "ProfilePic",
                                            "data": {
                                                "authorImage": sheet.ownerImageUrl,
                                                "authorStatement": sheet.ownerName,
                                            }
                                        },
                                        {
                                            "object": "text",
                                            "text": sheet.ownerName,
                                        }
                                    ]
                                },
                               {
                                    "object": "block",
                                    "type": "GroupStatement",
                                    "data": {
                                        "group": sheet.group,
                                        "groupLogo": sheet.groupLogo,
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


    const initialValue = Value.fromJSON(transformSheetJsonToDraft(props.data));
    const schema = {
        document: {
            nodes: [
                {match: {type: 'SheetMetaDataBox'}, min: 1, max: 1},
                {match: {type: 'paragraph'}, min: 1},
            ],
            normalize: (editor, {code, node, child, index}) => {
                switch (code) {
                    case 'child_type_invalid': {
                        const type = index === 0 ? 'SheetMetaDataBox' : 'paragraph';
                        return editor.setNodeByKey(child.key, type)
                    }
                    case 'child_min_invalid': {
                        const block = Block.create(index === 0 ? 'SheetMetaDataBox' : 'paragraph');
                        return editor.insertNodeByKey(node.key, index, block)
                    }
                }
            },
        },
       blocks: {
            SheetMetaDataBox: {
                nodes: [
                    {
                        match: {type: 'SheetTitle'}, min: 1, max: 1
                    },
                    {
                        match: {type: 'SheetAuthorStatement'}, min: 1, max: 1
                    },
                    {
                        match: {type: 'GroupStatement'}, max: 1
                    },
                ],
                normalize: (editor, {code, node, child, index}) => {
                    console.log(code, index);
                    switch (code) {
                        case 'child_type_invalid': {
                            switch (index) {
                                case 0: { //SheetTitle
                                    return editor.setNodeByKey(child.key, {
                                        type: "SheetTitle",
                                        data: {title: "Untitled Source Sheet"},
                                        nodes: [
                                            {
                                                "object": "text",
                                                "text": "Untitled Source Sheet",
                                            }
                                        ]
                                    })
                                }
                                case 1: { //SheetAuthorStatement
                                    return editor.setNodeByKey(child.key, {
                                        type: "SheetAuthorStatement",
                                        data: {title: "Untitled Source Sheet"},
                                        nodes: [

                                            {
                                                "object": "block",
                                                "type": "ProfilePic",
                                                "data": {
                                                    "authorImage": props.data.ownerImageUrl,
                                                    "authorStatement": props.data.ownerName,
                                                }
                                            },
                                            {
                                                "object": "text",
                                                "text": props.data.ownerName,
                                            }
                                        ]
                                    })
                                }
                                default: {
                                    return null
                                }

                            }
                        }
                        case 'child_min_invalid': {
                            const titleBlock = Block.create({
                                type: 'SheetTitle',
                                data: {title: "Untitled Source Sheet"},
                                nodes: [
                                    {
                                        "object": "text",
                                        "text": "Untitled Source Sheet",
                                    }
                                ]
                            });

                            const authorBlock = Block.create({
                                type: 'SheetAuthorStatement',
                                data: {
                                    authorImage: props.data.ownerImageUrl,
                                    authorUrl: props.data.ownerProfileUrl,
                                    authorStatement: props.data.ownerName,
                                },

                                nodes: [

                                    {
                                        "object": "block",
                                        "type": "ProfilePic",
                                        "data": {
                                            "authorImage": props.data.ownerImageUrl,
                                            "authorStatement": props.data.ownerName,
                                        }
                                    },
                                    {
                                        "object": "text",
                                        "text": props.data.ownerName,
                                    }
                                ]
                            });

                            return editor.insertNodeByKey(node.key, 0, titleBlock).insertNodeByKey(node.key, 1, authorBlock)
                        }
                    }
                }

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
        const { attributes, children, node } = props;
        const { data } = node;

        switch (node.type) {
            case 'paragraph':
                return (
                    <p {...attributes}>
                        {children}
                    </p>
                );
            case 'SheetMetaDataBox':
                return (
                    <SheetMetaDataBox>{children}</SheetMetaDataBox>
                );
            case 'SheetAuthorStatement':
                const authorUrl = data.get('authorUrl');
                const authorStatement = data.get('authorStatement');
                return (
                    <SheetAuthorStatement
                        authorUrl={authorUrl}
                        authorStatement={authorStatement}
                    >{children}</SheetAuthorStatement>
                );
            case 'ProfilePic':
                const authorImage = data.get('authorImage');
                const name = data.get('authorStatement');

                return (
                    <ProfilePic
                        url={authorImage}
                        len={30}
                        name={name}
                    />
                );

            case 'GroupStatement':
                const group = data.get('group');
                const groupLogo = data.get('groupLogo');
                return (
                    <GroupStatement
                        group={group}
                        groupLogo={groupLogo}
                    >{children}</GroupStatement>
                );
            case 'SheetTitle':
                const title = data.get('title');
                return (
                    <SheetTitle {...attributes} title={title}>{children}</SheetTitle>
                );
            default:
                return next()
        }
    }

    function renderMark(props, editor, next) {
        const {mark, attributes} = props;
        switch (mark.type) {
            case 'bold':
                return <strong {...attributes}>{props.children}</strong>;
            case 'italic':
                return <em {...attributes}>{props.children}</em>;
            case 'underline':
                return <u {...attributes}>{props.children}</u>;
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
            schema={schema}
        />
    )


}


module.exports = SefariaEditor;
