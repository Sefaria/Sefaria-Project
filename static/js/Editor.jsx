import React, {useCallback, useMemo, useState, useEffect, useRef} from 'react';
import {jsx} from 'slate-hyperscript'
import {withHistory} from 'slate-history'
import {Editor, createEditor, Range, Node, Point, Path} from 'slate'
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
];

const ELEMENT_TAGS = {
    A: el => ({type: 'link', url: el.getAttribute('href'), ref: el.getAttribute('data-ref')}),
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

const format_tag_pairs = [
    {
        tag: "EM",
        format: "italic"
    },
    {
        tag: "I",
        format: "italic"
    },
    {
        tag: "STRONG",
        format: "bold"
    },
    {
        tag: "B",
        format: "bold"
    },
    {
        tag: "U",
        format: "underline"
    },
    {
        tag: "BIG",
        format: "big"
    },
    {
        tag: "SMALL",
        format: "small"
    },
];

const TEXT_TAGS = format_tag_pairs.reduce((obj, item) => {
     obj[item.tag] = () => ({[item.format]: true })
     return obj
   }, {})

const format_to_html_lookup = format_tag_pairs.reduce((obj, item) => {
     obj[item.format] = item.tag;
     return obj
   }, {})


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

    if (TEXT_TAGS[nodeName]) {
        const attrs = TEXT_TAGS[nodeName](el)
        return children.map(child => jsx('text', attrs, child))
    }


    return children
};





export const serialize = (content) => {
    //serialize formatting to html
    if (content.text) {
        const tagStringObj = Object.keys(content).reduce((tagString, key) => {
            if (content[key] == true) {
                const htmlTag = format_to_html_lookup[key]
                const preTag = (tagString.preTags + "<" + htmlTag + ">");
                const postTag = ("</" + htmlTag + ">" + tagString.postTags);
                return {preTags: preTag.toLowerCase(), postTags: postTag.toLowerCase()}
            }
            return {preTags: tagString.preTags, postTags: tagString.postTags}
        }, {preTags: "", postTags: ""});

        return (`${tagStringObj.preTags}${content.text}${tagStringObj.postTags}`)
    }

    if (content.type == "link") {
      const linkHTML =  content.children.reduce((acc, text) => {
          return (acc + serialize(text))
      },"");

      return(content.ref ?
        `<a href="${content.url}" class="refLink" data-ref="${content.ref}">${linkHTML}</a>`
      : `<a href="${content.url}">${linkHTML}</a>`)
    }

    //serialize paragraphs to <p>...</p>
    if (content.type == "paragraph") {
        const paragraphHTML =  content.children.reduce((acc, text) => {
            return (acc + serialize(text))
        },"");
        return `<p>${paragraphHTML}</p>`
    }

    const children = content.children ? content.children.map(serialize) : [];

    return children.join('')
}


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
                            children: [{text: source.heRef}]
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
                            children: [{text: source.ref}]
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
                        }
                    ]
                }
            )
            return content
        }
        default: {
            return {
                text: "",
            }


        }
    }
}

function parseSheetItemHTML(rawhtml) {
    const parsed = new DOMParser().parseFromString(Sefaria.util.cleanHTML(rawhtml.replace(/[\n\r\t]/gm, "")), 'text/html');
    const fragment = deserialize(parsed.body);
    return fragment.length > 0 ? fragment : [{text: ''}];
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

    let initValue = [
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
            authorUrl: sheet.ownerProfileUrl,
            authorStatement: sheet.ownerName,
            authorImage: sheet.ownerImageUrl,
            title: sheetTitle,
            group: sheet.group,
            groupLogo: sheet.groupLogo,

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
                                        },
                                    ]
                                },
                                {
                                    text: '',
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
                <div className="SheetSource" {...attributes} style={{"borderColor": Sefaria.palette.refColor(element.ref)}}>
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
                    <div className="ref">{children}</div>
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
        case 'link':
          return (
            <a {...attributes} href={element.url}>
              {children}
            </a>
          )
        default:
            return <div>{children}</div>
    }

}

const isSelectionFocusAtEndOfSheetItem = (editor) => {
  const focus = editor.selection.focus
  const currentSheetItem = Node.closest(editor, focus.path, ([e]) => e.type == "SheetItem");
  const lastNodeInSheetItem = Node.last(currentSheetItem[0],[])

  // Check if cursor focus is in last node in sheet item
  if (Path.compare(currentSheetItem[1].concat(lastNodeInSheetItem[1]), focus.path) == 0) {
    if (lastNodeInSheetItem[0].text.length == focus.offset) {
      return true
    }
  }
  return false
}

const getNextSheetItemPath = (curPath) => {
    let path = curPath
    const newLastNode = path.pop() + 1
    path.push(newLastNode)
    return path
}



const getFirstSefRefInRange = (editor, activeSheetItem) => {
  const textContent = Node.text(Node.get(editor, activeSheetItem));
  const titles = Sefaria.titlesInText(textContent);
  if (titles.length == 0) {return null}
  const refRe = Sefaria.makeRefRe(titles)

  const match = refRe.exec(textContent);
  if (match) {
      return match;
  }
  return null
}


const withSheetData = editor => {
    const {exec, isVoid, normalizeNode} = editor;
    editor.isVoid = element => {
        return (voidElements.includes(element.type)) ? true : isVoid(element)
    };

    editor.normalizeNode = ([node, path]) => {
      // const sheetMetaData = doc.children.find(el => el.type == "SheetMetaDataBox");
      //
      // const sheetContent = doc.children.find(el => el.type == "SheetContent").children;
      const sheet = editor.children[0]
      const emptyOutsideText = {type: "SheetItem", children: [{type: "SheetOutsideText",node: 1, children: [{type: "paragraph", children: [{text: ""}]}],}]}
      const defaultSheetTitle = {type: 'SheetTitle', title: sheet.title, children: [{text: sheet.title}]}
      const defaultSheetAuthorStatement = {type: 'SheetAuthorStatement', authorUrl: sheet.authorUrl, authorStatement: sheet.authorStatement, children: [{type: 'ProfilePic', authorImage: sheet.authorImage, authorStatement: sheet.authorStatement, children: [{text: ''}]}, {text: ''}]}
      const defaultGroupStatement = {type: 'GroupStatement', group: sheet.group, groupLogo: sheet.groupLogo, children: [{text: sheet.group}]}
      const defaultMetaDataBox = {type: 'SheetMetaDataBox', children: [defaultSheetTitle, defaultSheetAuthorStatement, defaultGroupStatement]}

      if (node.type === 'Sheet') {
        if(node.children[1].type != "SheetContent") {
            const fragment = {type: "SheetContent", children: [emptyOutsideText]}
            Editor.insertNodes(editor, fragment, { at: path.concat(1)})
        }
        if(node.children[0].type != "SheetMetaDataBox") {
            Editor.insertNodes(editor, defaultMetaDataBox, { at: path.concat(0)})
        }
        if (node.children.length > 2) {
            Editor.removeNodes(editor, {at: [0,2]})
        }
      }

      if (node.type === 'SheetMetaDataBox') {
        if (node.children[0].type !== 'SheetTitle' || node.children[1].type !== 'SheetAuthorStatement' || node.children[2].type !== 'GroupStatement') {
          Editor.insertNodes(editor, defaultMetaDataBox, { at: path})
        }
      }

      if (node.type === 'SheetContent') {
        if (node.children.length ==0) {
          const fragment = emptyOutsideText
          Editor.insertNodes(editor, fragment, { at: path.concat(0)})
        }
      }


      // if (path.length === 0) { //start at editor level -- one above sheet
      //   if (editor.children.length > 1) {
      //     console.log("need to deal with extra nodes beyond sheet")
      //   }
      //
      //   if (editor.children.length < 2) {
      //     const paragraph = { type: 'paragraph', children: [{ text: '' }] }
      //     // Editor.insertNodes(editor, paragraph, { at: path.concat(1) })
      //   }
      //
      //   for (const [child, childPath] of Node.children(editor, path)) {
      //     const type = childPath[0] === 0 ? 'title' : 'paragraph'
      //
      //     if (child.type !== type) {
      //       // Editor.setNodes(editor, { type }, { at: childPath })
      //     }
      //   }
      // }

      return normalizeNode([node, path])
    }





    editor.exec = command => {
      // console.log(command)
        switch (command.type) {

            case 'insert_sheetItem': {
              switch (command.sheetItemType) {
                case 'SheetOutsideText': {
                  const fragment = {
                      type: "SheetItem",
                      children: [{
                          type: "SheetOutsideText",
                          node: editor.children[0].nextNode,
                          children: [{
                              type: "paragraph",
                              children: [{
                                  text: ""
                              }]
                          }],

                      }]
                  };
                  const nextSheetItemPath = getNextSheetItemPath(command.activeSheetItem);
                  Editor.setNodes(editor, { nextNode: editor.children[0].nextNode + 1 }, { at: [0] })
                  Editor.insertNodes(editor, fragment, {at: nextSheetItemPath})
                  Editor.move(editor)
                  break

                }

                case 'SheetSource': {
                  Sefaria.getText(command.sefRef).then(text => {
                      const enText =  Array.isArray(text.text) ? text.text.flat(Infinity).join(" ") : text.text;
                      const heText =  Array.isArray(text.text) ? text.he.flat(Infinity).join(" ") : text.he;

                      const fragment = {
                          type: "SheetItem",
                          children: [{
                              type: "SheetSource",
                              node: editor.children[0].nextNode,
                              ref: text.ref,
                              heRef: text.heRef,
                              title: null,
                              children: [
                                  {
                                      type: "TextRef",
                                      ref: text.ref,
                                      refText: text.heRef,
                                      lang: "he",
                                      children: [{text: text.heRef}]
                                  },
                                  {
                                      type: "he",
                                      children: parseSheetItemHTML(heText)
                                  },
                                  {
                                      type: "TextRef",
                                      ref: text.ref,
                                      refText: text.ref,
                                      lang: "en",
                                      children: [{text: text.ref}]
                                  },
                                  {
                                      type: "en",
                                      children: parseSheetItemHTML(enText)
                                  }
                              ]

                          }]
                      };

                      Editor.setNodes(editor, { nextNode: editor.children[0].nextNode + 1 }, { at: [0] })
                      Editor.insertNodes(editor, fragment, {at: command.activeSheetItem})
                      editor.exec({ type: 'delete_backward', unit: 'line'})
                      editor.exec({ type: 'delete_backward', unit: 'character'})
                      // Editor.removeNodes(editor, { at: getNextSheetItemPath(command.activeSheetItem) })
                  });
                  break
                }

                default: {
                    break
                }


              }
              break
            }

            case 'insert_break': {

                if (Node.closest(editor, editor.selection.focus.path, ([e]) => e.type == "SheetTitle")) {
                   editor.exec({ type: 'insert_text', text: '\n' })
                   break
                }

                if (!Range.isCollapsed(editor.selection)) {
                    exec(command)
                    break
                }

                if(isSelectionFocusAtEndOfSheetItem(editor)) {
                  const activeSheetItem = Node.closest(editor, editor.selection.focus.path, ([e]) => e.type == "SheetItem")[1]

                  const matchingRef = getFirstSefRefInRange(editor, activeSheetItem)

                  if (matchingRef && matchingRef[0] == matchingRef.input) {
                    editor.exec({type: 'insert_sheetItem', sheetItemType: 'SheetSource', activeSheetItem: activeSheetItem, sefRef: matchingRef[0]})
                    break
                }


                  editor.exec({type: 'insert_sheetItem', sheetItemType: 'SheetOutsideText', activeSheetItem: activeSheetItem})
                  break
                }
                exec(command)
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

const withLinks = editor => {
  const { exec, isInline } = editor

  editor.isInline = element => {
    return element.type === 'link' ? true : isInline(element)
  }
  return editor
}


const withFormatting = editor => {
    const {exec} = editor

    editor.exec = command => {
        switch (command.type) {
            case 'toggle_format': {
                const {format} = command;
                const isActive = isFormatActive(editor, format);
                Editor.setNodes(
                    editor,
                    {[format]: isActive ? null : true},
                    {match: 'text', split: true}
                )

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


const isFormatActive = (editor, format) => {
    const [match] = Editor.nodes(editor, {
        match: {[format]: true},
        mode: 'all',
    });

    return !!match
};


const Leaf = ({attributes, children, leaf}) => {
    if (leaf.bold) {
        children = <strong>{children}</strong>
    }
    if (leaf.italic) {
        children = <em>{children}</em>
    }
    if (leaf.underline) {
        children = <u>{children}</u>
    }
    if (leaf.big) {
        children = <big>{children}</big>
    }
    if (leaf.small) {
        children = <small>{children}</small>
    }

    return <span {...attributes}>{children}</span>
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
            <FormatButton editor={editor} format="bold"/>
            <FormatButton editor={editor} format="italic"/>
            <FormatButton editor={editor} format="underline"/>
        </div>,
        root
    )
};

const FormatButton = ({format}) => {
    const editor = useSlate()

    const isActive = isFormatActive(editor, format);
    const iconName = "fa-" + format;
    const classes = {fa: 1, active: isActive};
    classes[iconName] = 1;

    return (
        <span className="markButton"
              onMouseDown={event => {
                  event.preventDefault();
                  editor.exec({type: 'toggle_format', format})
              }}
        >
      <i className={classNames(classes)}/>
    </span>
    )


}

function saveSheetContent(doc, lastModified) {

    const sheetMetaData = doc.children.find(el => el.type == "SheetMetaDataBox");

    const sheetTitle = sheetMetaData.children.find(el => el.type == "SheetTitle").children.reduce((htmlString, fragment) => {
        return htmlString + serialize(fragment)
    }, "");


    const sheetContent = doc.children.find(el => el.type == "SheetContent").children;

    const sources = sheetContent.map(item => {
        const sheetItem = item.children[0];
        switch (sheetItem.type) {
            case 'SheetSource':

                const enBlock = sheetItem.children.find(el => el.type == "en");
                const heBlock = sheetItem.children.find(el => el.type == "he");

                let source = {
                    "ref": sheetItem.ref,
                    "heRef": sheetItem.heRef,
                    "text": {
                        "en": enBlock ? serialize(enBlock) : "...",
                        "he": heBlock ? serialize(heBlock) : "...",
                    },
                    "node": sheetItem.node,
                };
                return (source);
            case 'SheetOutsideBiText':
                let outsideBiText = {
                    "outsideBiText": {
                        "en": serialize(sheetItem.children.find(el => el.type == "en")),
                        "he": serialize(sheetItem.children.find(el => el.type == "he")),
                    },
                    "node": sheetItem.node,

                };
                return outsideBiText;

            case 'SheetComment':
                return ({
                    "comment": serialize(sheetItem),
                    "node": sheetItem.node,
                });

            case 'SheetOutsideText':
               return ({
                    "outsideText": serialize(sheetItem),
                    "node": sheetItem.node,
                });

            case 'SheetMedia':
                return({
                    "media": sheetItem.mediaUrl,
                    "node": sheetItem.node,
                });

            default:
                console.log(sheetItem)
                return null;
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
        sources: sources.filter(x => !!x),
        nextNode: doc.nextNode,
    };

    return JSON.stringify(sheet);

}


const SefariaEditor = (props) => {
    const sheet = props.data;
    const initValue = transformSheetJsonToDraft(sheet);
    const renderElement = useCallback(props => <Element {...props} />, []);
    const [value, setValue] = useState(initValue)
    const [selection, setSelection] = useState(null)
    const [currentDocument, setCurrentDocument] = useState(initValue);
    const [unsavedChanges, setUnsavedChanges] = useState(false);
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
        const json = saveSheetContent(doc[0], lastModified);
        console.log('saving...')

        $.post("/api/sheets/", {"json": json}, res => {
            setlastModified(res.dateModified);
            console.log("saved at: "+ res.dateModified);
            setUnsavedChanges(false)
        });
    }

    function onChange(value,selection) {
        if (currentDocument !== value) {
            setCurrentDocument(value);
        }

        setValue(value)
        setSelection(selection)
    }

    const beforeInput = event => {
        switch (event.inputType) {
            case 'formatBold':
                return editor.exec({type: 'toggle_format', format: 'bold'});
            case 'formatItalic':
                return editor.exec({type: 'toggle_format', format: 'italic'});
            case 'formatUnderline':
                return editor.exec({type: 'toggle_format', format: 'underline'})
        }
    };

    const onKeyDown = event => {
      if (event.key == " ") {
      if(isSelectionFocusAtEndOfSheetItem(editor)) {
        const activeSheetItem = Node.closest(editor, editor.selection.focus.path, ([e]) => e.type == "SheetItem")[1]
        const matchingRef = getFirstSefRefInRange(editor, activeSheetItem)

        if (matchingRef && matchingRef[0] == matchingRef.input) {
          editor.exec({type: 'insert_sheetItem', sheetItemType: 'SheetSource', activeSheetItem: activeSheetItem, sefRef: matchingRef[0]})
      }
    }

    }
  };


    const editor = useMemo(
        () => withSheetData(withLinks(withFormatting(withHistory(withReact(createEditor()))))),
        []
    );

    return (
        // Add the editable component inside the context.
        <Slate editor={editor} value={value} selection={selection} onChange={(value, selection) => onChange(value, selection)}>
            <HoverMenu/>

            <Editable
                renderLeaf={props => <Leaf {...props} />}
                renderElement={renderElement}
                placeholder="Enter a title…"
                spellCheck
                onKeyDown={onKeyDown}
                onDOMBeforeInput={beforeInput}
            />
        </Slate>
    )
};

export default SefariaEditor;
