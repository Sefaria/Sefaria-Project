import React, {useCallback, useMemo, useState, useEffect, useRef} from 'react';
import {jsx} from 'slate-hyperscript'
import {withHistory} from 'slate-history'
import {withSchema} from 'slate-schema'
import {Editor, createEditor, Range, Node} from 'slate'
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

const sheet_item_els = {
    ref: 'SheetSource',
    comment: 'SheetComment',
    outsideText: 'SheetOutsideText',
    outsideBiText: 'SheetOutsideBiText',
    media: 'SheetMedia',
};

const voidElements = [
    "ProfilePic",
    "TextRef"
];

const ELEMENT_TAGS = {
    A: el => ({type: 'link', url: el.getAttribute('href')}),
    BLOCKQUOTE: () => ({type: 'quote'}),
    H1: () => ({type: 'heading-one'}),
    H2: () => ({type: 'heading-two'}),
    H3: () => ({type: 'heading-three'}),
    H4: () => ({type: 'heading-four'}),
    H5: () => ({type: 'heading-five'}),
    H6: () => ({type: 'heading-six'}),
    IMG: el => ({type: 'image', url: el.getAttribute('src')}),
    LI: () => ({type: 'list-item'}),
    OL: () => ({type: 'numbered-list'}),
    P: () => ({type: 'paragraph'}),
    PRE: () => ({type: 'code'}),
    UL: () => ({type: 'bulleted-list'}),
};

const MARK_TAGS = {
    EM: () => ({type: 'italic'}),
    I: () => ({type: 'italic'}),
    STRONG: () => ({type: 'bold'}),
    B: () => ({type: 'bold'}),
    U: () => ({type: 'underline'}),
    BIG: () => ({type: 'big'}),
    SMALL: () => ({type: 'small'}),
};

export const deserialize = el => {
    if (el.nodeType === 3) {
        return el.textContent
    } else if (el.nodeType !== 1) {
        return null
    } else if (el.nodeName === 'BR') {
        return '\n'
    }

    const {nodeName} = el
    let parent = el

    if (
        el.nodeNode === 'PRE' &&
        el.childNodes[0] &&
        el.childNodes[0].nodeName === 'CODE'
    ) {
        parent = el.childNodes[0]
    }

    const children = Array.from(parent.childNodes).map(deserialize)

    if (el.nodeName === 'BODY') {
        return jsx('fragment', {}, children)
    }

    if (ELEMENT_TAGS[nodeName]) {
        const attrs = ELEMENT_TAGS[nodeName](el)
        return jsx('element', attrs, children)
    }

    if (MARK_TAGS[nodeName]) {
        const attrs = MARK_TAGS[nodeName](el)
        return jsx('mark', attrs, children)
    }

    return children
};


function renderSheetItem(source) {

    const sheetItemType = Object.keys(sheet_item_els).filter(key => Object.keys(source).includes(key))[0];

    switch (sheetItemType) {
        case 'ref': {
            const content = (
                {
                    type: sheet_item_els[sheetItemType],
                    ref: source.ref,
                    heRef: source.heRef,
                    title: source.title || null,
                    node: source.node,
                    children: [
                        {
                            type: "TextRef",
                            ref: source.ref,
                            refText: source.heRef,
                            lang: "he",
                            children: [{text: "", marks: []}]
                        },
                        {
                            type: "he",
                            children: parseSheetItemHTML(source.text.he)
                        },
                        {
                            type: "TextRef",
                            ref: source.ref,
                            refText: source.ref,
                            lang: "en",
                            children: [{text: "", marks: []}]
                        },
                        {
                            type: "en",
                            children: parseSheetItemHTML(source.text.en)
                        }
                    ]
                }
            )
            return content
        }
        case 'comment': {
            const content = (
                {
                    type: sheet_item_els[sheetItemType],
                    children: parseSheetItemHTML(source.comment),
                    node: source.node
                }
            )
            return content
        }
        case 'outsideText': {
            const content = (
                {
                    type: sheet_item_els[sheetItemType],
                    children: parseSheetItemHTML(source.outsideText),
                    node: source.node
                }
            )
            return content
        }
        case 'outsideBiText': {
            const content = (
                {
                    type: sheet_item_els[sheetItemType],
                    children: [
                        {
                            type: "he",
                            children: parseSheetItemHTML(source.outsideBiText.he)
                        },
                        {
                            type: "en",
                            children: parseSheetItemHTML(source.outsideBiText.en)
                        }
                    ],
                    node: source.node
                }
            )
            return content
        }
        case 'media': {
            const content = (
                {
                    type: sheet_item_els[sheetItemType],
                    mediaUrl: source.media,
                    node: source.node,
                    children: [
                        {
                            text: source.media,
                            marks: [],
                        }
                    ]
                }
            )
            return content
        }
        default: {
            return {
                text: "",
                marks: [],
            }


        }
    }
}

function parseSheetItemHTML(rawhtml) {
    const parsed = new DOMParser().parseFromString(Sefaria.util.cleanHTML(rawhtml.replace(/[\n\r\t]/gm, "")), 'text/html');
    const fragment = deserialize(parsed.body);
    return fragment.length > 0 ? fragment : [{text: '', marks: []}];
}


function transformSheetJsonToDraft(sheet) {
    const sheetTitle = sheet.title.stripHtmlKeepLineBreaks();

    let sourceNodes = sheet.sources.map(source => (
            {
                type: "SheetItem",
                children: [renderSheetItem(source)]
            }
        )
    );

    const initValue = [
        {
            type: 'Sheet',
            status: sheet.status,
            group: sheet.group,
            views: sheet.views,
            tags: sheet.tags,
            includedRefs: sheet.includedRefs,
            owner: sheet.owner,
            summary: sheet.summary,
            id: sheet.id,
            dateModified: sheet.dateModified,
            datePublished: sheet.datePublished,
            dateCreated: sheet.dateCreated,
            promptedToPublish: sheet.promptedToPublish,
            options: sheet.options,
            nextNode: sheet.nextNode,

            children: [
                {
                    type: 'SheetMetaDataBox',
                    children: [
                        {
                            type: 'SheetTitle',
                            title: sheetTitle,
                            children: [
                                {
                                    text: sheetTitle,
                                    marks: [],
                                }

                            ]
                        },
                        {
                            type: 'SheetAuthorStatement',
                            authorUrl: sheet.ownerProfileUrl,
                            authorStatement: sheet.ownerName,
                            children: [
                                {
                                    type: 'ProfilePic',
                                    authorImage: sheet.ownerImageUrl,
                                    authorStatement: sheet.ownerName,
                                    children: [
                                        {
                                            text: '',
                                            marks: [],
                                        },
                                    ]
                                },
                                {
                                    text: '',
                                    marks: [],
                                },


                            ]
                        },
                        {
                            type: 'GroupStatement',
                            group: sheet.group,
                            groupLogo: sheet.groupLogo,
                            children: [
                                {
                                    text: sheet.group,
                                    marks: [],
                                }

                            ]
                        },
                    ]

                },
                {
                    type: 'SheetContent',
                    children: sourceNodes
                }

            ]
        }
    ];
    return initValue;
}

const Element = ({attributes, children, element}) => {
    switch (element.type) {
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
            return (
                <SheetAuthorStatement
                    authorUrl={element.authorUrl}
                    authorStatement={element.authorStatement}
                >{children}</SheetAuthorStatement>
            );
        case 'ProfilePic':
            return (
                <ProfilePic
                    url={element.authorImage}
                    len={30}
                    name={element.authorStatement}
                />
            );

        case 'GroupStatement':
            return (
                <GroupStatement
                    group={element.group}
                    groupLogo={element.groupLogo}
                >{children}</GroupStatement>
            );
        case 'SheetTitle':
            return (
                <SheetTitle title={element.title}>{children}</SheetTitle>
            );
        case 'TextRef':
            return (
                <div className={element.lang}>
                    <div className="ref">{element.refText}</div>
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
            return <div>{children}</div>
    }

}

const withSheetData = editor => {
    const {exec, isVoid} = editor;
    editor.isVoid = element => {
        return (element.type in voidElements) ? true : isVoid(element)
    };

    editor.exec = command => {
        switch (command.type) {
            case 'soft_linebreak': {
                return editor.exec({ type: 'insert_text', text: '\n' })

            }
            case 'enter_toggled': {
                if (!Range.isCollapsed(editor.selection)) {
                    exec(command);
                    break
                }

                const path = editor.selection.focus.path;
                console.log(Node.closest(editor, path, ([e]) => e.type == "SheetItem"));
                exec(command);
                break
            }

            default: {
                exec(command);
                break
            }
        }
    }


    return editor
}

const withMarks = editor => {
    const {exec} = editor

    editor.exec = command => {
        switch (command.type) {
            case 'toggle_mark': {
                const {mark} = command;
                const isActive = isMarkActive(editor, mark.type);
                const cmd = isActive ? 'remove_mark' : 'add_mark';
                editor.exec({type: cmd, mark});
                break
            }

            default: {
                exec(command);
                break
            }
        }
    }

    return editor
}


const isMarkActive = (editor, type) => {
    const [mark] = Editor.marks(editor, {match: {type}, mode: 'all'});
    return !!mark
};

const Mark = ({attributes, children, mark}) => {
    switch (mark.type) {
        case 'bold':
            return <strong {...attributes}>{children}</strong>;
        case 'italic':
            return <em {...attributes}>{children}</em>;
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

        const domSelection = window.getSelection();
        const domRange = domSelection.getRangeAt(0);
        const rect = domRange.getBoundingClientRect();
        el.style.opacity = 1;
        el.style.top = `${rect.top + window.pageYOffset - el.offsetHeight}px`;

        el.style.left = `${rect.left +
        window.pageXOffset -
        el.offsetWidth / 2 +
        rect.width / 2}px`

    });

    const root = window.document.getElementById('s2');
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

    const isActive = isMarkActive(editor, type);
    const iconName = "fa-" + type;
    const classes = {fa: 1, active: isActive};
    classes[iconName] = 1;

    return (
        <span className="markButton"
              onMouseDown={event => {
                  event.preventDefault();
                  editor.exec({type: 'toggle_mark', mark: {type}})
              }}
        >
      <i className={classNames(classes)}/>
    </span>
    )


}

function saveSheetContent(doc, lastModified, nextSheetNode) {

    //const sheetTitle = (convertBlockTextToHTML(doc.getBlocksByType("SheetTitle").get(0).getTexts()));

    const sheetMetaData = doc[0].children.find(el => el.type == "SheetMetaDataBox")


    const sheetTitle = sheetMetaData.children.find(el => el.type == "SheetTitle").children;

    console.log(sheetTitle);

    return;


    const sheetContent = doc.filterDescendants(n => n.type === 'SheetItem');

    let sources = [];

    sheetContent.forEach(item => {
        const sheetItem = item.nodes.get(0);

        switch (sheetItem.get("type")) {

            case 'SheetSource':

                const enBlock = sheetItem.findDescendant(n => n.type === "en");
                const heBlock = sheetItem.findDescendant(n => n.type === "he");

                let source = {
                    "ref": sheetItem.getIn(['data', 'ref']),
                    "heRef": sheetItem.getIn(['data', 'heRef']),
                    "text": {
                        "en": enBlock ? convertBlockTextToHTMLWithParagraphs(enBlock.nodes) : "...",
                        "he": heBlock ? convertBlockTextToHTMLWithParagraphs(heBlock.nodes) : "...",
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
        status: doc.status,
        group: doc.group,
        id: doc.id,
        promptedToPublish: doc.promptedToPublish,
        lastModified: lastModified,
        summary: doc.summary,
        options: doc.options,
        tags: doc.tags,
        title: sheetTitle,
        sources: sources,
        nextNode: nextSheetNode,
    };

    return JSON.stringify(sheet);

}


const SefariaEditor = (props) => {
    const sheet = props.data;
    const initValue = transformSheetJsonToDraft(sheet);
    const renderElement = useCallback(props => <Element {...props} />, []);

    const [currentDocument, setCurrentDocument] = useState(initValue);
    const [unsavedChanges, setUnsavedChanges] = useState(false);
    const [nextSheetNode, setNextSheetMode] = useState(props.data.nextNode);
    const [lastModified, setlastModified] = useState(props.data.dateModified);


    useEffect(
        () => {
            setUnsavedChanges(true)
            // Update debounced value after delay
            const handler = setTimeout(() => {
                saveDocument(currentDocument);
            }, 500);

            // Cancel the timeout if value changes (also on delay change or unmount)
            // This is how we prevent debounced value from updating if value is changed ...
            // .. within the delay period. Timeout gets cleared and restarted.
            return () => {
                clearTimeout(handler);
            };
        },
        [currentDocument] // Only re-call effect if value or delay changes
    );

    function saveDocument(doc) {
        console.log("Saving");
        console.log(doc);
        saveSheetContent(doc, lastModified, nextSheetNode)

        // $.post("/api/sheets/", {"json": saveSheetContent(doc, lastModified, nextSheetNode)}, res => {
        //     setlastModified(res.dateModified);
        //     console.log("saved at: "+ res.dateModified);
        //     setUnsavedChanges(false)
        // });
    }

    function onChange(value) {
        if (currentDocument !== value) {
            setCurrentDocument(value);
        }
    }

    const beforeInput = event => {
        switch (event.inputType) {
            case 'formatBold':
                return editor.exec({type: 'toggle_mark', mark: 'bold'});
            case 'formatItalic':
                return editor.exec({type: 'toggle_mark', mark: 'italic'});
            case 'formatUnderline':
                return editor.exec({type: 'toggle_mark', mark: 'underline'})
        }
    };

    const onKeyDown = event => {
        switch (event.key) {
            case 'Enter':
                const path = editor.selection.focus.path;
                if (Node.closest(editor, path, ([e]) => e.type == "SheetTitle")) {
                    event.preventDefault();
                    return editor.exec({type: 'soft_linebreak'})

                };
                return
            default: {
                return
            }
        }
    };


    const editor = useMemo(
        () => withSheetData(withMarks(withHistory(withReact(createEditor())))),
        []
    );

    return (
        // Add the editable component inside the context.
        <Slate editor={editor} defaultValue={initValue} onChange={value => onChange(value)}>
            <HoverMenu/>

            <Editable
                renderMark={props => <Mark {...props} />}
                renderElement={renderElement}
                placeholder="Enter a title…"
                spellCheck
                onDOMBeforeInput={beforeInput}
                onKeyDown={onKeyDown}

            />
        </Slate>
    )
};

export default SefariaEditor;
