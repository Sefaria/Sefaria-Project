import React, {useState, useEffect} from 'react';
import {Editor} from 'slate-react'
import {Block, Value, Range, Data, Inline, Selection, Point} from 'slate'
import Html from 'slate-html-serializer'
import Sheet from "./Sheet";
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

// Add a dictionary of mark tags.
const MARK_TAGS = {
    em: 'italic',
    strong: 'bold',
    b: 'bold',
    u: 'underline',
    small: 'small',
    big: 'big',
};

const BLOCK_TAGS = {
    blockquote: 'block-quote',
    p: 'paragraph',
    ul: 'bulleted-list',
    li: 'list-item',
    ol: 'numbered-list',
    h1: 'heading-one',
    h2: 'heading-two',
};

const sheet_item_els = {
    ref: 'SheetSource',
    comment: 'SheetComment',
    outsideText: 'SheetOutsideText',
    outsideBiText: 'SheetOutsideBiText',
    media: 'SheetMedia',
};

const HoverMenu = React.forwardRef(({editor}, ref) => {
    const root = window.document.getElementById('s2')
    return ReactDOM.createPortal(
        <div ref={ref} className="hoverMenu">
            <MarkButton editor={editor} type="bold"/>
            <MarkButton editor={editor} type="italic"/>
            <MarkButton editor={editor} type="underline"/>
        </div>,
        root
    )
});


function showStyleMenu() {

    return {

        onChange(editor, next) {
            let menu = $(".hoverMenu");

            const native = window.getSelection();

            if (native.isCollapsed) {
                menu.removeAttr("style")
                return
            }

            const range = native.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            let top = `${rect.top + window.pageYOffset - menu.outerHeight()}px`;
            let left = `${rect.left + window.pageXOffset - menu.outerWidth() / 2 + rect.width / 2}px`;
            menu.css({
                "opacity": 1,
                "top": top,
                "left": left
            })
        }
    }

}

const MarkButton = ({editor, type}) => {
    const {value} = editor
    const isActive = value.activeMarks.some(mark => mark.type === type)

    const iconName = "fa-" + type;
    const classes = {fa: 1, active: isActive};
    classes[iconName] = 1;
    return (
        <span className="markButton"
              onMouseDown={event => {
                  event.preventDefault()
                  editor.toggleMark(type)
              }}
        >
      <i className={classNames(classes)}/>
    </span>
    )
}

const plugins = [showStyleMenu()]


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
                    case 'small':
                        return <small>{children}</small>
                    case 'big':
                        return <big>{children}</big>
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
                    case 'underline':
                        return <u>{children}</u>
                    case 'code':
                        return <code>{children}</code>
                }
            }
        },
    },
];

const html = new Html({rules})

function parseSheetItemHTML(rawhtml) {
    return (
        html.deserialize(
            Sefaria.util.cleanHTML(rawhtml.replace(/[\n\r\t]/gm, ""))
        ).toJSON()["document"]["nodes"]
    )
}

function renderSheetItem(source) {

    const sheetItemType = Object.keys(sheet_item_els).filter(key => Object.keys(source).includes(key))[0]

    switch (sheetItemType) {
        case 'ref': {
            const content = (
                {
                    "object": "block",
                    "type": sheet_item_els[sheetItemType],
                    "data": {
                        "ref": source.ref,
                        "heRef": source.heRef,
                        "title": source.title || null,
                        "node": source.node
                    },
                    "nodes": [
                        {
                            "object": "block",
                            "type": "TextRef",
                            "data": {
                                "ref": source.ref,
                                "refText": source.heRef,
                                "lang": "he",
                            },
                        },
                        {
                            "object": "block",
                            "type": "he",
                            "data": {"heRef": source.heRef},
                            "nodes": parseSheetItemHTML(source.text.he)
                        },
                        {
                            "object": "block",
                            "type": "TextRef",
                            "data": {
                                "ref": source.ref,
                                "refText": source.ref,
                                "lang": "en",
                            },
                        },
                        {
                            "object": "block",
                            "type": "en",
                            "data": {"ref": source.ref},
                            "nodes": parseSheetItemHTML(source.text.en)
                        }
                    ]
                }
            )
            return content
        }
        case 'comment': {
            const content = (
                {
                    "object": "block",
                    "type": sheet_item_els[sheetItemType],
                    "nodes": parseSheetItemHTML(source.comment),
                    "data": {
                        "node": source.node
                    },
                }
            )
            return content
        }
        case 'outsideText': {
            const content = (
                {
                    "object": "block",
                    "type": sheet_item_els[sheetItemType],
                    "nodes": parseSheetItemHTML(source.outsideText),
                    "data": {
                        "node": source.node
                    },
                }
            )
            return content
        }
        case 'outsideBiText': {
            const content = (
                {
                    "object": "block",
                    "type": sheet_item_els[sheetItemType],
                    "nodes": [
                        {
                            "object": "block",
                            "type": "he",
                            "nodes": parseSheetItemHTML(source.outsideBiText.he)
                        },
                        {
                            "object": "block",
                            "type": "en",
                            "nodes": parseSheetItemHTML(source.outsideBiText.en)
                        }
                    ],
                    "data": {
                        "node": source.node
                    },
                }
            )
            return content
        }
        case 'media': {
            const content = (
                {
                    "object": "block",
                    "type": sheet_item_els[sheetItemType],
                    "data": {
                        "mediaUrl": source.media,
                        "node": source.node,
                    },
                    "nodes": [
                        {
                            "object": "text",
                            "text": source.media
                        }
                    ]
                }
            )
            return content
        }
        default: {
            return {
                "object": "text",
                "text": "null"
            }

        }
    }
}

function transformSheetJsonToDraft(sheet) {
    const sheetTitle = sheet.title.stripHtmlKeepLineBreaks();

    const sourceNodes = sheet.sources.map(source => (
            {
                "object": "block",
                "type": "SheetItem",
                "nodes": [renderSheetItem(source)]
            }
        )
    );

    let sheetJSON = (
        {
            "object": "value",
            "document": {
                "object": "document",
                "data": {
                    "status": sheet.status,
                    "group": sheet.group,
                    "views": sheet.views,
                    "tags": sheet.tags,
                    "includedRefs": sheet.includedRefs,
                    "owner": sheet.owner,
                    "summary": sheet.summary,
                    "id": sheet.id,
                    "dateModified": sheet.dateModified,
                    "datePublished": sheet.datePublished,
                    "dateCreated": sheet.dateCreated,
                    "promptedToPublish": sheet.promptedToPublish,
                    "options": sheet.options,
                    "nextNode": sheet.nextNode,
                },
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
                        "type": "SheetContent",
                        "nodes": sourceNodes
                    },


                ]
            }
        }
    )
    return sheetJSON;
}

const schema = {
    document: {
        nodes: [
            {match: {type: 'SheetMetaDataBox'}, min: 1, max: 1},
            {match: {type: 'SheetContent'}, min: 1},
        ],
        normalize: (editor, {code, node, child, index}) => {
            switch (code) {
                case 'child_type_invalid': {
                    const type = index === 0 ? 'SheetMetaDataBox' : 'SheetContent';
                    return editor.setNodeByKey(child.key, type)
                }
                case 'child_min_invalid': {
                    const block = Block.create(index === 0 ? 'SheetMetaDataBox' : 'SheetContent');
                    return editor.insertNodeByKey(node.key, index, block)
                }
            }
        },
    },
    inlines: {},
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

                        return editor.insertNodeByKey(node.key, 0, titleBlock)
                    }
                }
            }

        },
        SheetContent: {
            nodes: [
                {
                    match: {type: 'SheetItem'},
                },
            ],
        },
        SheetItem: {
            nodes: [
                {
                    match: {object: 'text'},
                },
                {
                    match: {type: 'SheetSource'},
                },
                {
                    match: {type: 'SheetComment'},
                },
                {
                    match: {type: 'SheetOutsideText'},
                },
                {
                    match: {type: 'SheetOutsideBiText'},
                },
                {
                    match: {type: 'SheetMedia'},
                },
            ]
        },

        SheetSource: {
            nodes: [
                {
                    match: {object: 'text'},
                },
                {
                    match: {object: 'block'},
                },
                {
                    match: {type: 'TextRef'},
                },
            ]
        },
        he: {
            nodes: [
                {
                    match: {object: 'text'},
                },
                {
                    match: {object: 'block'},
                },
            ]
        },
        en: {
            nodes: [
                {
                    match: {object: 'text'},
                },
                {
                    match: {object: 'block'},
                },
            ]
        },
        SheetComment: {
            nodes: [
                {
                    match: {object: 'text'},
                },
                {
                    match: {object: 'block'},
                },
            ]
        },
        SheetOutsideText: {
            nodes: [
                {
                    match: {object: 'text'},
                },
                {
                    match: {object: 'block'},
                },
            ]
        },
        SheetOutsideBiText: {
            nodes: [
                {
                    match: {object: 'text'},
                },
                {
                    match: {object: 'block'},
                },
            ]
        },
        SheetMedia: {
            nodes: [
                {
                    match: {object: 'text'},
                },
                {
                    match: {object: 'block'},
                },
            ]
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
        TextRef: {
            isVoid: true,
            data: {
                ref: v => v,
                refText: v => v,
                lang: v => v,
            },
        },

    },


};

function convertBlockTextToHTMLWithParagraphs(block) {
    let paragraphs = "";
    block.forEach(subBlock => {
        if (subBlock.get("type") == "paragraph") {
          paragraphs += "<p>"+(convertBlockTextToHTML(subBlock.getTexts()))+"</p>";
        }
    });
    return paragraphs;
}

function convertBlockTextToHTML(block) {
    const possibleMarks = {
        italic: 'em',
        bold: 'strong',
        underline: 'u'
    };


    let blockHTML = "";

    block.forEach(text => {
        let prependTextTags = "";
        let appendTextTags = "";

        text.marks.forEach(mark => {
            const type = possibleMarks[mark.type];
            if (type) {
                prependTextTags = prependTextTags + "<" + type + ">";
                appendTextTags = "</" + type + ">" + appendTextTags;
            }
        });

    blockHTML = blockHTML + prependTextTags + text.text + appendTextTags;
    });

    return blockHTML;
}


function saveSheetContent(doc, lastModified, nextSheetNode) {
    //console.log(data.toJSON().document);

    const sheetJSONData = doc.data;
    const sheetTitle = (convertBlockTextToHTML(doc.getBlocksByType("SheetTitle").get(0).getTexts()));
    const sheetContent = doc.filterDescendants(n => n.type === 'SheetItem');

    let sources = [];

    sheetContent.forEach(item => {
        const sheetItem = item.nodes.get(0);

        switch (sheetItem.get("type")) {

            case 'SheetSource':

                let source = {
                    "ref": sheetItem.getIn(['data', 'ref']),
                    "heRef": sheetItem.getIn(['data', 'heRef']),
                    "text": {
                      "en": convertBlockTextToHTMLWithParagraphs(sheetItem.findDescendant(n => n.type === "en").nodes),
                      "he": convertBlockTextToHTMLWithParagraphs(sheetItem.findDescendant(n => n.type === "he").nodes),
                    },
                    "node": sheetItem.getIn(['data', 'node']),

                };
                sources.push(source);
                return;
            case 'OutsideBiText':
                let outsideBiText = {
                    "outsideBiText": {
                      "en": convertBlockTextToHTMLWithParagraphs(sheetItem.findDescendant(n => n.type === "en").nodes),
                      "he": convertBlockTextToHTMLWithParagraphs(sheetItem.findDescendant(n => n.type === "he").nodes),
                    },
                    "node": sheetItem.getIn(['data', 'node']),

                };
                sources.push(outsideBiText);
                return;

            case 'SheetComment':
                sources.push({
                    "comment": convertBlockTextToHTMLWithParagraphs(sheetItem.nodes),
                    "node": sheetItem.getIn(['data', 'node']),
                });
                return;

            case 'SheetOutsideText':
                sources.push({
                    "outsideText": convertBlockTextToHTMLWithParagraphs(sheetItem.nodes),
                    "node": sheetItem.getIn(['data', 'node']),
                });
                return;

            case 'SheetMedia':
                sources.push({
                    "media": sheetItem.getIn(['data', 'mediaUrl']),
                    "node": sheetItem.getIn(['data', 'node']),
                    });
                return;

            default:
                console.log(sheetItem.get("type"));
                return;
        }

    });




    let sheet = {
        status: sheetJSONData.get("status"),
        group: sheetJSONData.get("group"),
        id: sheetJSONData.get("id"),
        promptedToPublish: sheetJSONData.get("promptedToPublish"),
        lastModified: lastModified,
        summary: sheetJSONData.get("summary"),
        options: sheetJSONData.get("options"),
        tags: sheetJSONData.get("tags"),
        title: sheetTitle,
        sources: sources,
        nextNode: nextSheetNode,
    };

    return JSON.stringify(sheet);

}


function SefariaEditor(props) {
    const menuRef = React.createRef();

    const v = Value.fromJSON(transformSheetJsonToDraft(props.data));
    const [value, setValue] = useState(v);
    const [currentDocument, setCurrentDocument] = useState(v.document);
    const [lastModified, setlastModified] = useState(props.data.dateModified);
    const [nextSheetNode, setNextSheetMode] = useState(props.data.nextNode);
    const [endOfBlock, setEndOfBlock] = useState("moo");
    const [unsavedChanges, setUnsavedChanges] = useState(false);

    useEffect(
        () => {
          setUnsavedChanges(true)
          // Update debounced value after delay
          const handler = setTimeout(() => {
            saveDocument(currentDocument);
          }, 2000);

          // Cancel the timeout if value changes (also on delay change or unmount)
          // This is how we prevent debounced value from updating if value is changed ...
          // .. within the delay period. Timeout gets cleared and restarted.
          return () => {
            clearTimeout(handler);
          };
        },
        [currentDocument] // Only re-call effect if value or delay changes
    );

    const emptyBlockJSON = {
        "object": "block",
        "type": "SheetItem",
        "nodes": [{
            "object": "block",
            "type": "SheetOutsideText",
            "data": {
                "node": nextSheetNode
            },
            "nodes": [{
                "object": "block",
                "type": "paragraph",
                "nodes": [{
                    "object": "text",
                    "text": ""
                }]
            }],

        }]
    };

    function addNewSheetItem(editor) {
        const sheetContentKey = editor.value.document.filterDescendants(n => n.type === 'SheetContent').get(0).key;
        const curSelectionPath = editor.value.selection.focus.path;
        const curSheetItemPath = curSelectionPath.slice(0, 2);
        const nextIndex = curSheetItemPath.get(1)+1;
        setNextSheetMode(nextSheetNode + 1);
        let emptyBlock = Block.fromJSON(emptyBlockJSON);
        return editor.insertNodeByKey(sheetContentKey, nextIndex, emptyBlock).moveToEndOfNode(editor.value.document.getNode(curSheetItemPath)).moveForward(1);
    }

    function onKeyDown(event, editor, next) {
        if (event.key == 'Enter') {

            if (isEndOfSheetItemBlockContent(editor.value)) {
                event.preventDefault();
                return addNewSheetItem(editor);
            } else {
                return next();
            }
        }
        else if (event.key == " ") {
            const textContent = editor.value.focusText;
            const titles = Sefaria.titlesInText(textContent.text);

            if (titles.length == 0) {return next()}

            const refRe = Sefaria.makeRefRe(titles)

            const match = refRe.exec(textContent.text);
            if (match) {
                const focus = match.index + match[0].trim().length;
                const anchor = match.index;

                /*
                {
                    anchor: {
                        key: textContent.key,
                        offset: anchor,
                    },
                    focus: {
                        key: textContent.key,
                        offset: focus,
                    },
                }
                */
                event.preventDefault;

                editor.select({
                    anchor: {
                        key: textContent.key,
                        offset: anchor,
                    },
                    focus: {
                        key: textContent.key,
                        offset: focus,
                    },
                }).insertInline({
                    data: {ref: match[0]},
                    nodes: [{
                        "object": "text",
                        "text": match[0]
                    }],
                    type: "inlineTextRef"
                });

            }

/*






            if (foundRefs.length > 0) {
                const textsInBlock = editor.value.focusBlock.getTexts();
                    debugger;
                for (const [node, path] of textsInBlock) {

                    const {key, text} = node;
                    console.log(text)
                    const parts = text.split(foundRefs[0]);
                    let offset = 0;

                    parts.forEach((part, i) => {
                        console.log(i)
                        console.log(path)
                        console.log(key)
                        console.log(offset)
                    })
                }
            }
*/
        }
        else {
            return next();
        }
    }

    function renderBlock(props, editor, next) {
        const {attributes, children, node} = props;
        const {data} = node;

        const heRef = data.get('heRef');
        const ref = data.get('ref');

        switch (node.type) {

            case 'SheetItem':
                return (
                    <div className="sheetItem segment" {...attributes}>
                        {children}
                    </div>
                );
            case 'SheetSource':
                return (
                    <div className="SheetSource" {...attributes}>
                        {children}
                    </div>
                );

            case 'SheetComment':
                return (
                    <div {...attributes}>
                        {children}
                    </div>
                );

            case 'SheetOutsideText':
                return (
                    <div {...attributes}>
                        {children}
                    </div>
                );

            case 'SheetOutsideBiText':
                return (
                    <div {...attributes}>
                        {children}
                    </div>
                );

            case 'SheetMedia':
                return (
                    <div {...attributes}>
                        {children}
                    </div>
                );
            case 'he':
                return (
                    <div className="he">
                        {children}
                    </div>
                );
            case 'en':
                return (
                    <div className="en">
                        {children}
                    </div>
                );
            case 'SheetContent':
                return (
                    <div className="text" {...attributes}>
                        {children}
                    </div>
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
                    <SheetTitle title={title}>{children}</SheetTitle>
                );
            case 'TextRef':
                const ref = data.get('ref')
                const lang = data.get('lang')
                return (
                    <div className={lang}>
                        <div className="ref"><a href={"/" + ref}>{data.get("refText")}</a></div>
                    </div>
                )
            case 'paragraph':
                return (
                    <p>{children}</p>
                );
            case 'bulleted-list':
                return (
                    <ul>{children}</ul>
                );
            case 'list-item':
                return (
                    <li>{children}</li>
                );

            default:
                return next()
        }
    }

    function renderMark(props, editor, next) {
        const {mark, attributes} = props;
        console.log('render mark')
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
        const {attributes, children, node} = props;
        const {data} = node;
        switch (node.type) {
            case 'inlineTextRef':
                const ref = data.get('ref');
                return (
                    <span className="ref"><a href={"/" + ref}>{children}</a></span>
                );
            default:
                return next()
        }
    }

    function saveDocument(doc) {
        console.log("Saving");
        $.post("/api/sheets/", {"json": saveSheetContent(doc, lastModified, nextSheetNode)}, res => {
            setlastModified(res.dateModified);
            console.log("saved at: "+ res.dateModified);
            setUnsavedChanges(false)
        });
    }

    function isEndOfSheetItemBlockContent(v) {
        //Usually the end of the node *is* the end of the sheetItem block, b/c of legacy sheets sometimes another
        // paragraph follows it -- this ensures this value is set correctly in that case
        return (v.selection.focus.isAtEndOfNode(v.anchorBlock) && v.document.getNextNode(v.anchorBlock.key).get("type") !== "paragraph")
    }

    function onChange({v}) {
        setEndOfBlock(isEndOfSheetItemBlockContent(v));
        if (currentDocument !== v.document) {
            setCurrentDocument(v.document);
        }
        setValue(v);
    }

    function renderEditor(props, editor, next) {
        const children = next();
        return (
            <React.Fragment>
                {children}
                <HoverMenu ref={menuRef} editor={editor}/>
            </React.Fragment>
        )
    }

    function getMetaMsg() {
        return (
            endOfBlock ? "Enter adds new OutsideText" :
            unsavedChanges ? "Saving..." : "All Changes Saved"
        )
    }

    return (
        <div>
            <div className="editorHoverBox">{getMetaMsg()}</div>
            <Editor
                onKeyDown={(event, editor, next) => onKeyDown(event, editor, next)}
                value={value}
                renderBlock={(props, editor, next) => renderBlock(props, editor, next)}
                renderMark={(props, editor, next) => renderMark(props, editor, next)}
                renderInline={(props, editor, next) => renderInline(props, editor, next)}
                schema={schema}
                plugins={plugins}
                renderEditor={(props, editor, next) => renderEditor(props, editor, next)}
                onChange={({value:v}) => onChange({v})}
            />
        </div>
    )


}

export default SefariaEditor;
