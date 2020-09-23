import React, {useCallback, useMemo, useState, useEffect, useRef} from 'react';
import {jsx} from 'slate-hyperscript'
import {withHistory} from 'slate-history'
import {Editor, createEditor, Range, Node, Transforms, Path, Text, Point} from 'slate'
import {Slate, Editable, ReactEditor, withReact, useSlate, useSelected, useFocused} from 'slate-react'
import isHotkey from 'is-hotkey'

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
    "SheetMedia",
];


const HOTKEYS = {
  'mod+b': 'bold',
  'mod+i': 'italic',
  'mod+u': 'underline',
}

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
   }, {});

const format_to_html_lookup = format_tag_pairs.reduce((obj, item) => {
     obj[item.format] = item.tag;
     return obj
   }, {});


export const deserialize = el => {
    if (el.nodeType === 3) {
        return el.textContent
    } else if (el.nodeType !== 1) {
        return null
    } else if (el.nodeName === 'BR') {
        return '\n'
    }

    const {nodeName} = el;
    let parent = el;

    if (
        el.nodeNode === 'PRE' &&
        el.childNodes[0] &&
        el.childNodes[0].nodeName === 'CODE'
    ) {
        parent = el.childNodes[0]
    }

    const children = Array.from(parent.childNodes).map(deserialize).flat();


    if (el.nodeName === 'BODY') {
        return jsx('fragment', {}, children)
    }

    if (ELEMENT_TAGS[nodeName]) {
        const attrs = ELEMENT_TAGS[nodeName](el);
        return jsx('element', attrs, children)
    }

    if (TEXT_TAGS[nodeName]) {
      const attrs = TEXT_TAGS[nodeName](el);
      return children.map(child => jsx('text', attrs, ((typeof child === "string" || Text.isText(child)) ? child : Node.string(child))))
    }
    return children
};





export const serialize = (content) => {
    //serialize formatting to html
    if (content.text) {
        const tagStringObj = Object.keys(content).reduce((tagString, key) => {
            if (content[key] == true) {
                const htmlTag = format_to_html_lookup[key];
                const preTag = (tagString.preTags + "<" + htmlTag + ">");
                const postTag = ("</" + htmlTag + ">" + tagString.postTags);
                return {preTags: preTag.toLowerCase(), postTags: postTag.toLowerCase()}
            }
            return {preTags: tagString.preTags, postTags: tagString.postTags}
        }, {preTags: "", postTags: ""});

        return (`${tagStringObj.preTags}${content.text.replace(/(\n)+/g, '<br/>')}${tagStringObj.postTags}`)
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
                            type: "he",
                            children:  [
                              {
                                  type: "TextRef",
                                  ref: source.ref,
                                  refText: source.heRef,
                                  lang: "he",
                                  children: [{text: source.heRef}]
                              },
                              {
                                type: "SourceContentText",
                                children: parseSheetItemHTML(source.text.he)
                              }
                            ]
                        },
                        {
                          type: "en",
                          children:  [
                            {
                                type: "TextRef",
                                ref: source.ref,
                                refText: source.ref,
                                lang: "en",
                                children: [{text: source.ref}]
                            },
                            {
                              type: "SourceContentText",
                              children: parseSheetItemHTML(source.text.en)
                            }
                          ]
                        }
                    ]
                }
            );
            return content
        }
        case 'comment': {
            const content = (
                {
                    type: sheet_item_els[sheetItemType],
                    children: parseSheetItemHTML(source.comment),
                    node: source.node
                }
            );
            return content
        }
        case 'outsideText': {
            const lang = Sefaria.hebrew.isHebrew(source.outsideText.stripHtml()) ? 'he' : 'en';

            const content = (
                {
                    type: sheet_item_els[sheetItemType],
                    children: parseSheetItemHTML(source.outsideText),
                    node: source.node,
                    lang: lang
                }
            );
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
            );
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
            );
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
    const parsed = new DOMParser().parseFromString(Sefaria.util.cleanHTML(rawhtml), 'text/html');
    const fragment = deserialize(parsed.body);
    const slateJSON = fragment.length > 0 ? fragment : [{text: ''}];
    return slateJSON[0].type == 'paragraph' ? slateJSON : [{type: 'paragraph', children: slateJSON}]
}

const defaultSheetTitle = (title) => {
    return {
        type: 'SheetTitle',
        title: title ? title : "",
        children: [
            {
                text: title ? title : "",
            }

        ]
    }
};

const defaultSheetAuthorStatement = (ownerProfileUrl, ownerName, ownerImageUrl) => {
    return {
        type: 'SheetAuthorStatement',
        authorUrl: ownerProfileUrl,
        authorStatement: ownerName,
        children: [
        {
            type: 'ProfilePic',
            authorImage: ownerImageUrl,
            authorStatement: ownerName,
            children: [
                {
                    text: '',
                },
            ]
        },
        {
            type: "byline",
            owner: ownerName,
            children: [
                {
                    text: "by "
                },
                {
                    type: "link",
                    url: ownerProfileUrl,
                    children: [
                        {text: ownerName}
                    ]
                },
            ]
        },
    ]
}
};

const defaultSheetGroupStatement = (group, groupLogo) => {
    return {
        type: 'GroupStatement',
        group: group || "",
        groupLogo: groupLogo || "",
        children: [
            {
                text: group || "",
            }

        ]

    };
}


const defaultsheetMetaDataBox = (sheetTitle, authorStatement, groupStatement) => {
    return {
        type: 'SheetMetaDataBox',
        children: [sheetTitle, authorStatement, groupStatement]
    }
}

const defaultEmptyOutsideText = (sheetNodeNumber, textFragment) => {
  return {
        type: "SheetItem",
        children: [{
            type: "SheetOutsideText",
            node: sheetNodeNumber,
            children: [{
                type: "paragraph",
                children: [{text: textFragment}]
            }],
        }]
    }
}

function getInitialSheetNodes(sheet) {
  return sheet["sources"].map(source => source["node"])
}

function transformSheetJsonToDraft(sheet) {
    const sheetTitle = sheet.title.stripHtmlKeepLineBreaks();

    let curNextNode = sheet.nextNode;

    let sourceNodes = [];
    let lastItemWasSource = false;

    sheet.sources.forEach( source => {
      // this snippet of code exists to create placeholder outsideTexts in between souces to allow for easier editting.
      // blank outsidetexts are removed down in saveSheetContent()
      if (source["ref"]) {
        if (lastItemWasSource) {
          sourceNodes.push({
            type: "SheetItem",
            children: [renderSheetItem({node: curNextNode, outsideText: ""})]
          })
          curNextNode++;
        }
        lastItemWasSource = true;
      }
      else {
        lastItemWasSource = false;
      }
      //-------//

      sourceNodes.push({
          type: "SheetItem",
          children: [renderSheetItem(source)]
      });


    });
    //Ensure there's always something to edit at bottom of sheet.
    if (sourceNodes.length == 0 || (sourceNodes[sourceNodes.length - 1]["children"][0]["type"] != "SheetOutsideText")) {
        sourceNodes.push({
          type: "SheetItem",
          children: [renderSheetItem({node: curNextNode, outsideText: ""})]
        })
        curNextNode++;

    }

    let initValue = [
        {
            type: 'Sheet',
            status: sheet.status,
            group: sheet.group || "",
            views: sheet.views,
            tags: sheet.tags || [],
            includedRefs: sheet.includedRefs,
            owner: sheet.owner,
            summary: sheet.summary || "",
            id: sheet.id,
            dateModified: sheet.dateModified,
            datePublished: sheet.datePublished,
            dateCreated: sheet.dateCreated,
            promptedToPublish: sheet.promptedToPublish,
            options: sheet.options,
            nextNode: curNextNode,
            edittingSource: false,
            authorUrl: sheet.ownerProfileUrl,
            authorStatement: sheet.ownerName,
            authorImage: sheet.ownerImageUrl,
            title: sheetTitle,
            groupLogo: sheet.groupLogo || "",
            likes: sheet.likes || [],

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
                              {type: "byline",
                                  owner: sheet.ownerName,
                                  children: [
                                      {
                                          text: "by "
                                      },
                                      {
                                          type: "link",
                                          url: sheet.ownerProfileUrl,
                                          children: [
                                              {text: sheet.ownerName}
                                          ]
                                      },
                                  ]
                              },
                            ]
                        },
                        {
                            type: 'GroupStatement',
                            group: sheet.group || "",
                            groupLogo: sheet.groupLogo || "",
                            children: [
                                {
                                    text: sheet.group || "",
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

function isSourceEditable(e, editor) {
  if (editor.children[0]["edittingSource"]) {return true}

  const isEditable = (Range.isRange(editor.selection) && !Range.isCollapsed(editor.selection))
  Transforms.setNodes(editor, {edittingSource: isEditable}, {at: [0]});
  return (isEditable)
}

const Element = ({attributes, children, element}) => {
    switch (element.type) {
        case 'SheetItem':
            const sheetItemClasses = `sheetItem ${Node.string(element) ? '':'empty'}`;
            return (
                <div className={sheetItemClasses} {...attributes}>
                    {children}
                <div className="clearFix"></div>
                </div>
            );
        case 'SheetSource':
            const editor = useSlate();
            const selected = useSelected();
            const classes = {SheetSource: 1, segment: 1, selected: selected };
            return (
                <div onMouseDown={(e) => isSourceEditable(e, editor)} className={classNames(classes)} {...attributes} style={{"borderColor": Sefaria.palette.refColor(element.ref)}}>
                    {children}
                </div>
            );

        case 'SheetComment':
            return (
                <div className="SheetComment segment" {...attributes}>
                    {children}
                </div>
            );

        case 'SheetOutsideText':
                const SheetOutsideTextClasses = `SheetOutsideText segment ${element.lang}`;
                return (
                <div className={SheetOutsideTextClasses} {...attributes}>
                    {element.loading ? <div className="sourceLoader"></div> : null}
                    {children}
                </div>
            );

        case 'SheetOutsideBiText':
            return (
                <div className="SheetOutsideBiText segment" {...attributes}>
                    {children}
                </div>
            );

        case 'SheetMedia':

            if (element.mediaUrl.match(/\.(jpeg|jpg|gif|png)$/i) != null) {
              return <div className="SheetMedia media"><img className="addedMedia" src={element.mediaUrl} />{children}</div>
            }
            else if (element.mediaUrl.toLowerCase().indexOf('youtube') > 0) {
              return <div className="media fullWidth SheetMedia"><div className="youTubeContainer"><iframe width="100%" height="100%" src={element.mediaUrl} frameBorder="0" allowFullScreen></iframe>{children}</div></div>
            }
            else if (element.mediaUrl.toLowerCase().indexOf('soundcloud') > 0) {
              return <div className="SheetMedia media fullWidth"><iframe width="100%" height="166" scrolling="no" frameBorder="no" src={element.mediaUrl}></iframe>{children}</div>
            }

            else if (element.mediaUrl.match(/\.(mp3)$/i) != null) {
              return <div className="SheetMedia media fullWidth"><audio src={element.mediaUrl} type="audio/mpeg" controls>Your browser does not support the audio element.</audio>{children}</div>
            }

            else {
              return <div className="SheetMedia media fullWidth">{children}</div>
            }

            return (
                <div className="SheetMetaDataBox segment" {...attributes}>
                    {children}
                </div>
            );
        case 'he':
            const heSelected = useSelected();
            const heEditable = useSlate().children[0]["edittingSource"];
            const heClasses = {he: 1, editable: heEditable, selected: heSelected };
            return (
                <div className={classNames(heClasses)}>
                    {children}
                </div>
            );
        case 'en':
            const enSelected = useSelected();
            const enEditable = useSlate().children[0]["edittingSource"];
            const enClasses = {en: 1, editable: enEditable, selected: enSelected };
            return (
                <div className={classNames(enClasses)}>
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
                    outerStyle={{width: "30px", height: "30px", display: "inline-block", verticalAlign: "middle", marginRight: "10px"}}
                >{children}</ProfilePic>
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
                <SheetTitle empty={Node.string(element) ? false:true} title={element.title}>{children}</SheetTitle>
            );
        case 'TextRef':
            return (
              <div className="ref" contentEditable={false} style={{ userSelect: 'none' }}>{children}</div>
            )
        case 'SourceContentText':
            return (
              <div className="sourceContentText">{children}</div>
            )
        case 'paragraph':
            return (
                <p>{children}</p>
            );
        case 'byline':
            return (
                <span>{children}</span>
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

const getClosestSheetElement = (editor, path, elementType) => {
    for(const node of Node.ancestors(editor, path)) {
        if (node[0].type == elementType) {
            return node;
            break
        }
    }
    return(null);
}

const activeSheetSources = editor => {
  return Array.from(Editor.nodes(editor, {
    at: editor.selection,
    match: n => n.type === "SheetSource"
  }));
}

const isWholeSheetItemSelected = (editor) => {
  if (Range.isCollapsed(editor.selection)) {return false}

  const focus = editor.selection.focus;
  const anchor = editor.selection.anchor;

  const currentSheetItem = (getClosestSheetElement(editor, focus.path, "SheetItem"));
  if (!currentSheetItem) {return false}

  const lastNodeInSheetItem = Node.last(currentSheetItem[0], []);
  const firstNodeInSheetItem = Node.first(currentSheetItem[0], []);

  if (
    0 == anchor.offset &&
    lastNodeInSheetItem[0].text.length == focus.offset &&
    Path.compare(currentSheetItem[1].concat(lastNodeInSheetItem[1]), focus.path) == 0 &&
    Path.compare(currentSheetItem[1].concat(firstNodeInSheetItem[1]), anchor.path) == 0
  ) {
    return currentSheetItem[1]
  }

  else {return false}

}

const isSelectionFocusAtEdgeOfSheetItem = (editor) => {
  const focus = editor.selection.focus;
  const currentSheetItem = (getClosestSheetElement(editor, focus.path, "SheetItem"));

  if (!currentSheetItem) return false;

  const lastNodeInSheetItem = Node.last(currentSheetItem[0],[]);
  const firstNodeInSheetItem = Node.first(currentSheetItem[0],[]);

  if (Path.compare(currentSheetItem[1].concat(lastNodeInSheetItem[1]), focus.path) == 0) {
    if (lastNodeInSheetItem[0].text.length == focus.offset) {
      return "bottom"
    }
  }
  else if  (Path.compare(currentSheetItem[1].concat(firstNodeInSheetItem[1]), focus.path) == 0) {
    if (0 == focus.offset) {
      return "top"
    }
  }

  return false
};

const getNextSheetItemPath = (SheetItemPath) => {
    let path = SheetItemPath;
    const newLastNode = path.pop() + 1
    path.push(newLastNode);
    return path
};

async function getRefInText(editor) {
  const closestSheetItem = getClosestSheetElement(editor, editor.selection.focus.path, "SheetItem")
  if (!closestSheetItem) {return {}}
  const query = Node.string(closestSheetItem[0]).trim();

  //return null if query length is too long to be a ref or if query is empty
  if (query.length > 50 || query == "") {return {}}

  const ref = await Sefaria.getName(query)
      .then(d => {
    // If the query isn't recognized as a ref, but only for reasons of capitalization. Resubmit with recognizable caps.
    if (Sefaria.isACaseVariant(query, d)) {
      this.submitSearch(Sefaria.repairCaseVariant(query, d));
      return;
    }

    return d

    // if (d["is_ref"] && (d["is_segment"] || d["is_section"]) ) {
    //   return(d["ref"]);  //todo: pass an onError function through here to the panel onError function
    // }
    // else {
    //   return null;
    // }
  });
  return ref
}


const withSefariaSheet = editor => {
    const {insertData, isVoid, normalizeNode} = editor;

    //Hack to override this built-in which often returns null when programmatically selecting the whole SheetSource
    Transforms.deselect = () => {}

    editor.isVoid = element => {
        return (voidElements.includes(element.type)) ? true : isVoid(element)
    };

    editor.deleteBackward = (unit) => {
        //If backspace is pressed at the start of an outside text that is surrounded by sheet sources, don't delete it
        const textBox = getClosestSheetElement(editor, editor.selection.focus["path"], "SheetOutsideText")
        if (textBox && Point.equals(editor.selection.focus, Editor.start(editor, textBox[1]))) {
            if (Point.equals(Editor.start(editor, textBox[1]), Editor.start(editor, Node.first(editor, [0,1])[1]))) {
                Transforms.move(editor, {unit: "character", distance: 1, reverse: true})
                return
            }
            else if (Point.equals(Editor.end(editor, textBox[1]), Editor.end(editor, Node.last(editor, [0,1])[1]))) {
                Transforms.move(editor, {unit: "character", distance: 1, reverse: true})
                return
            }

            else if (Node.get(editor, (Path.previous(Path.parent(textBox[1])))).children[0].type === "SheetSource" &&
                Node.get(editor, (Path.next(Path.parent(textBox[1])))).children[0].type === "SheetSource"
            ) {
                Transforms.move(editor, {unit: "character", distance: 1, reverse: true})
                return
            }
        }

        //default normal backspace behavior
        Transforms.delete(editor, {unit, reverse: true});
    }

    editor.insertBreak = () => {

        if (!Range.isCollapsed(editor.selection)) {
            editor.insertText("\n");
            return
        }

        getRefInText(editor).then(query =>{
          if (query["is_ref"] && (query["is_segment"] || query["is_section"]) ) {
          insertSource(editor, query["ref"])
          return
        }


          const selectionAtEdge = isSelectionFocusAtEdgeOfSheetItem(editor);
          if (selectionAtEdge) {
              const fragment = defaultEmptyOutsideText(editor.children[0].nextNode, "")
              addItemToSheet(editor, fragment, selectionAtEdge);
              Transforms.move(editor);
              return
          }

          editor.insertText("\n");
        })

    };


    editor.insertData = data => {
      const text = data.getData('text/plain')

      const pastedMediaLink = parseMediaLink(text);

      if (pastedMediaLink) {
        event.preventDefault();
        insertMedia(editor, pastedMediaLink)

      }
      else {
        insertData(data)
        checkAndFixDuplicateSheetNodeNumbers(editor);
      }
    };


    editor.normalizeNode = entry => {
      const [node, path] = entry;

      let sheetElementTypes = Object.values(sheet_item_els);

      if (node.type == "Sheet") {
          if (node.children && node.children.length == 1) {
            const fragmentText = defaultEmptyOutsideText(editor.children[0].nextNode, "")
            const fragment = {
                  type: 'SheetContent',
                  children: [fragmentText]
            }
            Transforms.insertNodes(editor, fragment, {at: [0,1]});
          }
      }

      // Autoset language of an outside text for proper RTL/LTR handling
      if (node.type == "SheetOutsideText") {
          const content = Node.string(node);
          const lang = Sefaria.hebrew.isHebrew(content) ? 'he' : 'en';
          Transforms.setNodes(editor, { lang: lang }, {at: path});
      }


      if (node.type == "SheetMetaDataBox") {
        // If SheetMetaDataBox is missing a title or authorStatement or groupStatement, reset it
          if (node.children.length < 3) {
              const editorSheetMeta = editor.children[0];
              const newMetaBox = defaultsheetMetaDataBox(
                  defaultSheetTitle(node.children[0].type == "SheetTitle" ? Node.string(node.children[0]) : ""),
                  defaultSheetAuthorStatement(editorSheetMeta['authorUrl'], editorSheetMeta['authorStatement'], editorSheetMeta['authorImage']),
                  defaultSheetGroupStatement(editorSheetMeta['group'], editorSheetMeta['groupLogo'])
              );
              Transforms.delete(editor, {at: path});
              Transforms.insertNodes(editor, newMetaBox, { at: path });
          }

          //Only allow SheetTitle, SheetAuthorStatement & GroupStatement in SheetMeta
          for (const [child, childPath] of Node.children(editor, path)) {
            console.log(child)
            if (!["SheetTitle", "SheetAuthorStatement", "GroupStatement"].includes(child.type)) {
              Transforms.removeNodes(editor, { at: childPath })
              return
            }
          }
      }

      // If SheetAuthorStatement is missing content reset it
      if (node.type == "SheetAuthorStatement") {
          if (node.children.length < 2) {
              const editorSheetMeta = editor.children[0];
              Transforms.delete(editor, {at: path});
              Transforms.insertNodes(editor, defaultSheetAuthorStatement(editorSheetMeta['authorUrl'], editorSheetMeta['authorStatement'], editorSheetMeta['authorImage']), { at: path });
          }
      }


      // prevent any edits to username
      // if (node.type == "byline") {
      //   const currentText = Node.string(node);
      //   if (currentText != `by ${node.owner}`) {
      //     const fragment = {
      //       type: "byline",
      //       owner: node.owner,
      //       children: [
      //         {text: "by "},
      //         {type: "link", url: node.owner, children: [{text: node.owner}]},
      //       ]
      //     }
      //     Transforms.delete(editor, {at: path});
      //     Transforms.insertNodes(editor, fragment, { at: path });
      //     Transforms.move(editor, { unit: 'block', distance: 2 })
      //
      //   }
      // }

      if (node.type == "SheetContent") {
        // If sheet elements are in sheetcontent and not wrapped in sheetItem, wrap it.
        for (const [child, childPath] of Node.children(editor, path)) {
          if (sheetElementTypes.includes(child.type)) {
            Transforms.wrapNodes(editor,
              {
                  type: "SheetItem",
                  children: [child],
                  }
                            ,{ at: childPath })
            return
          }
          if (child.hasOwnProperty('text')) {

            const fragmentText = child.text
            const fragment = defaultEmptyOutsideText(editor.children[0].nextNode, fragmentText)

            Transforms.delete(editor, {at: childPath});
            Transforms.insertNodes(editor, fragment, { at: childPath });

            return

          }
        }
        if ((node.children[node.children.length-1].children[0].type) != "SheetOutsideText") {
            Transforms.select(editor, Editor.end(editor, []));
            Editor.insertBreak(editor)
            return
        }
      }


      // SheetItems should only be of a specific type and only one per sheet item
      if (node.type == "SheetItem") {
        for (const [child, childPath] of Node.children(editor, path)) {
          if (!sheetElementTypes.includes(child.type)) {
            Transforms.unwrapNodes(editor, { at: childPath })
            return
          }
          else if (node.children && node.children.length > 1) {
            Transforms.liftNodes(editor, { at: childPath })
            return
          }
        }
      }


      //anything pasted into a sheet source object or a sheet outsideBiText will be treated just as text content
      if (["SheetSource", "SheetOutsideBiText"].includes(node.type)) {
        for (const [child, childPath] of Node.children(editor, path)) {
          if (sheetElementTypes.includes(child.type) || child.type == "SheetItem") {
            Transforms.unwrapNodes(editor, { at: childPath })
            return
          }
        }

      }

      if (node.type == "he" || node.type == "en") {
        //only allow TextRef & SourceContentText in he or en
        // if extra -- merge it with the previous element
          if (node.children && node.children.length > 2) {
          for (const [child, childPath] of Node.children(editor, path)) {
              if (!["SourceContentText", "TextRef"].includes(child.type)) {
                Transforms.mergeNodes(editor, { at: childPath})
                return
              }
            }
          }
          //for he's or en's in a SheetSource, make sure that SourceContentText exists
          if (Node.parent(editor, path).type == "SheetSource") {
            if (node.children && node.children.length < 2) {
              const insertPath = path.concat([1])
              Transforms.insertNodes(editor,{
                              type: "SourceContentText",
                              children: parseSheetItemHTML('...')
                            }, { at: insertPath });
            }

          }
      }

      // Anything pasted into SourceContentText will be treated as text
      if (node.type == "SourceContentText") {
        for (const [child, childPath] of Node.children(editor, path)) {
          if (child.type != "paragraph" && !child.text) {
            Transforms.unwrapNodes(editor, { at: childPath })
            return
          }
        }
        if (Node.string(node) == "") {
          editor.insertText("...")
        }
      }

      //if a sheetitem is stuck somewhere it shouldnt be raise it up to proper doc level
      if (node.type == "SheetItem" && (Node.parent(editor, path)).type != "SheetContent") {
          Transforms.liftNodes(editor, { at: path })
      }


      // if (node.type == "SheetSource") {
      //   //If a sheet source's Hebrew element AND english element are both missing their header or their source content, delete the whole sheetItem
      //   if (
      //         (node.children[0].children.length < 2 || Node.string(node.children[0].children[1]) == "..." ) &&
      //         (node.children.length < 2 || node.children[1].children.length < 2 || Node.string(node.children[1].children[1]) == "...")
      //       ) {
      //
      //         // Transforms.setNodes(editor, {type: "SheetOutsideText"}, {at: path});
      //         Transforms.removeNodes(editor, {at: Path.parent(path)});
      //
      //   }
      // }

      // if extra content is in sheet source -- merge it with the previous element
      // if (node.type == "SheetSource") {
      //     if (node.children && node.children.length > 4) {
      //     for (const [child, childPath] of Node.children(editor, path)) {
      //         if (!["en", "he", "TextRef"].includes(child.type)) {
      //           [prev, prevPath] = Editor.previous(editor, { at: childPath });
      //           Transforms.mergeNodes(editor, { at: childPath})
      //           return
      //         }
      //       }
      //     }
      // }


      // Fall back to the original `normalizeNode` to enforce other constraints.
      normalizeNode(entry)
    };

    return editor
};

const parseMediaLink = (url) => {

  if (url.match(/^https?/i) == null) {
    return null;
  }
  const youtube_re = /https?:\/\/(www\.)?(youtu(?:\.be|be\.com)\/(?:.*v(?:\/|=)|(?:.*\/)?)([\w'-]+))/i;
  let m;
  if ((m = youtube_re.exec(url)) !== null) {
    if (m.index === youtube_re.lastIndex) {
      youtube_re.lastIndex++;
    }
      if (m.length>0) {
        return ('https://www.youtube.com/embed/'+m[m.length-1]+'?rel=0&amp;showinfo=0')
      }
  } else if (url.match(/^https?:\/\/(www\.)?.+\.(jpeg|jpg|gif|png)$/i) != null) {
    return url;
  } else if (url.match(/^https?:\/\/(www\.)?.+\.(mp3)$/i) != null) {
    return url;
  } else if (url.match(/^https?:\/\/(www\.|m\.)?soundcloud\.com\/[\w\-\.]+\/[\w\-\.]+\/?/i) != null) {
    return 'https://w.soundcloud.com/player/?url='+ url + '&amp;color=ff5500&amp;auto_play=false&amp;hide_related=true&amp;show_comments=false&amp;show_user=true&amp;show_reposts=false';
  } else {
    return
  }
}

const incrementNextSheetNode = (editor) => {
  Transforms.setNodes(editor, {nextNode: editor.children[0].nextNode + 1}, {at: [0]});
}

const addItemToSheet = (editor, fragment, position) => {
    const closestSheetItem = getClosestSheetElement(editor, editor.selection.focus.path, "SheetItem")[1];
    const nextSheetItemPath = position == "top" ? closestSheetItem : getNextSheetItemPath(closestSheetItem);
    incrementNextSheetNode(editor);
    Transforms.insertNodes(editor, fragment, {at: nextSheetItemPath});
};



const checkAndFixDuplicateSheetNodeNumbers = (editor) => {
  let existingSheetNodes = []

  for (const [child, childPath] of Node.children(editor, [0,1])) {
    const sheetNode = child.children[0];
    if (existingSheetNodes.includes(sheetNode.node)) {
      const newNodeEditPath = childPath.concat([0]);
      Transforms.setNodes(editor, {node: editor.children[0].nextNode}, {at: newNodeEditPath});
      existingSheetNodes.push(editor.children[0].nextNode);
      incrementNextSheetNode(editor)
    }
    else {
      existingSheetNodes.push(sheetNode.node)
    }
  }
}

const insertMedia = (editor, mediaUrl) => {
  const fragment = {
      type: "SheetItem",
      children: [{
          type: "SheetMedia",
          mediaUrl: mediaUrl,
          node: editor.children[0].nextNode,
          children: [{
                  text: ""
              }]
      }]
  };
  addItemToSheet(editor, fragment, "bottom");
  Transforms.move(editor);
}

const insertSource = (editor, ref) => {

    const currentNode = getClosestSheetElement(editor, editor.selection.focus.path, "SheetOutsideText")
    Transforms.setNodes(editor, { loading: true }, {at: currentNode[1]});

    Sefaria.getText(ref).then(text => {
        const enText = Array.isArray(text.text) ? `<p>${text.text.flat(Infinity).join("</p><p>")}</p>` : text.text;
        const heText = Array.isArray(text.text) ? `<p>${text.he.flat(Infinity).join("</p><p>")}</p>` : text.he;

        //add an empty outside text to serve as a placeholder after the source to be added below to allow for easy editing
        const emptyFragment = defaultEmptyOutsideText(editor.children[0].nextNode, "")
        addItemToSheet(editor, emptyFragment, "bottom");

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
                        type: "he",
                        children:  [
                          {
                              type: "TextRef",
                              ref: text.ref,
                              refText: text.heRef,
                              lang: "he",
                              children: [{text: text.heRef}]
                          },
                          {
                            type: "SourceContentText",
                            children: parseSheetItemHTML(heText)
                          }
                        ]
                    },
                    {
                      type: "en",
                      children:  [
                        {
                            type: "TextRef",
                            ref: text.ref,
                            refText: text.ref,
                            lang: "en",
                            children: [{text: text.ref}]
                        },
                        {
                          type: "SourceContentText",
                          children: parseSheetItemHTML(enText)
                        }
                      ]
                    }
                ]
            }]
        };
        addItemToSheet(editor, fragment, "bottom");
        Transforms.setNodes(editor, { loading: false }, { at: currentNode[1] });
        Transforms.insertText(editor, '', { at: currentNode[1] })
        Transforms.move(editor, { unit: 'block', distance: 9 })
    });
};

const withLinks = editor => {
  const { insertData, insertText, isInline } = editor

  editor.isInline = element => {
    return element.type === 'link' ? true : isInline(element)
  };

  editor.insertText = text => {
    if (text && Sefaria.util.isUrl(text)) {
      wrapLink(editor, text)
    } else {
      insertText(text)
    }
  };

  editor.insertData = data => {
    const text = data.getData('text/plain')

    if (text && Sefaria.util.isUrl(text)) {
      wrapLink(editor, text)
    } else {
      insertData(data)
    }
  };

  return editor
};

const isLinkActive = editor => {
  const [link] = Editor.nodes(editor, { match: n => n.type === 'link' })
  return !!link
};

const wrapLink = (editor, url) => {
  if (isLinkActive(editor)) {
    unwrapLink(editor)
  }

  const { selection } = editor
  const isCollapsed = selection && Range.isCollapsed(selection)
  const link = {
    type: 'link',
    url,
    children: isCollapsed ? [{ text: url }] : [],
  };

  if (isCollapsed) {
    Transforms.insertNodes(editor, link)
  } else {
    Transforms.wrapNodes(editor, link, { split: true })
    Transforms.collapse(editor, { edge: 'end' })
  }
};

const toggleFormat = (editor, format) => {
  const isActive = isFormatActive(editor, format)

  if (isActive) {
    Editor.removeMark(editor, format)
  } else {
    Editor.addMark(editor, format, true)
  }
};

const isFormatActive = (editor, format) => {
  const [match] = Editor.nodes(editor, {
    match: n => n[format] === true,
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
    if (leaf.isRef) {
        children = <span className="inlineTextRef">{children}</span>
    }

    return <span {...attributes}>{children}</span>
};

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
            Editor.string(editor, selection) === ''
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
                  toggleFormat(editor, format);
              }}
        >
      <i className={classNames(classes)}/>
    </span>
    )


};

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
                        "en": enBlock ? serialize(enBlock.children[1]) : "...",
                        "he": heBlock ? serialize(heBlock.children[1]) : "...",
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
                const outsideTextText = serialize(sheetItem)
               //don't save empty outsideTexts
               if (outsideTextText=="<p></p>") {return}

               return ({
                    "outsideText": outsideTextText,
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
        title: sheetTitle == "" ? "Untitled" : sheetTitle,
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
    const [sheetNodes, setSheetNodes] = useState(getInitialSheetNodes(sheet))
    const [currentDocument, setCurrentDocument] = useState(initValue);
    const [unsavedChanges, setUnsavedChanges] = useState(false);
    const [lastModified, setlastModified] = useState(props.data.dateModified);
    const [fullSheetItemSelectedPath, setFullSheetItemSelectedPath] = useState(null);
    const [currentSelection, setCurrentSelection] = useState([]);

    function ensureSelectOfEntireSource(currentSelection) {

      if(currentSelection.length > 0) {

        if (editor.children[0]["edittingSource"]) {
          const textBox = getClosestSheetElement(editor, editor.selection.anchor["path"], "SourceContentText")

          if (!textBox) {return}

          const textBoxEnd = Editor.end(editor, textBox[1])
          const textBoxStart = Editor.start(editor, textBox[1])

          // debugger;

          if (Range.isBackward(editor.selection) && Point.isBefore(editor.selection.focus, Editor.start(editor, textBox[1]))) {
            console.log("out of bounds top")
            Transforms.select(editor, {
              focus: { path: textBoxStart["path"], offset: textBoxStart["offset"]},
              anchor: { path: editor.selection.anchor["path"], offset: editor.selection.anchor["offset"]}
            });

          }

          else if (!(Range.isBackward(editor.selection)) && Point.isAfter(editor.selection.focus, Editor.end(editor, textBox[1]))) {
            console.log("out of bounds below")
            Transforms.select(editor, {
              focus: { path: textBoxEnd["path"], offset: textBoxEnd["offset"]},
              anchor: { path: editor.selection.anchor["path"], offset: editor.selection.anchor["offset"]}
            });
          }
          return
        }

        const firstSourceEdge = Editor.before(editor, (currentSelection[0][1]))
        const lastSourceEdge = Editor.after(editor, (currentSelection[currentSelection.length - 1][1]))


        if (Range.isBackward(editor.selection)) {
          const anchorLoc = Point.isAfter(lastSourceEdge, editor.selection.anchor) ? lastSourceEdge : editor.selection.anchor;
          if (Point.isBefore(firstSourceEdge, editor.selection.focus) || Point.equals(firstSourceEdge, editor.selection.focus)) {
            Transforms.select(editor, {
              focus: { path: firstSourceEdge["path"], offset: firstSourceEdge["offset"]},
              anchor: { path: anchorLoc.path, offset: anchorLoc.offset}

            });
          }
        }
        else {
          const anchorLoc = Point.isBefore(firstSourceEdge, editor.selection.anchor) ? firstSourceEdge : editor.selection.anchor;
          if (Point.isAfter(lastSourceEdge, editor.selection.focus, ) || Point.equals(lastSourceEdge, editor.selection.focus, )) {
            Transforms.select(editor, {
              focus: { path: lastSourceEdge["path"], offset: lastSourceEdge["offset"]},
              anchor: { path: anchorLoc.path, offset: anchorLoc.offset}
            });
          }
        }

      }

      else {
        Transforms.setNodes(editor, {edittingSource: false}, {at: [0]});
      }

    }

    useEffect(
        () => {
            // Update debounced value after delay
            const handler = setTimeout(() => {
                ensureSelectOfEntireSource(currentSelection);
            }, 250);

            // Cancel the timeout if value changes (also on delay change or unmount)
            // This is how we prevent debounced value from updating if value is changed ...
            // .. within the delay period. Timeout gets cleared and restarted.
            return () => {
                clearTimeout(handler);
            };
        },
        [currentSelection] // Only re-call effect if value or delay changes
    );


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

    function onChange(value) {
      if(!ReactEditor.isFocused(editor)) {
        ReactEditor.focus(editor);
        Transforms.select(editor, Editor.end(editor, []));
        // Prevents sources from being selected by clicks outside of editor
        return
      }
        // setFullSheetItemSelectedPath(isWholeSheetItemSelected(editor));
        const selectedSheetSources = activeSheetSources(editor);
        if (currentSelection != selectedSheetSources) {
          setCurrentSelection(selectedSheetSources)
        }


        if (currentDocument !== value) {
            setCurrentDocument(value);
        }

        setValue(value)
    }

    const beforeInput = event => {
        switch (event.inputType) {
            case 'formatBold':
                return toggleFormat(editor, 'bold');
            case 'formatItalic':
                return toggleFormat(editor, 'italic')
            case 'formatUnderline':
                return toggleFormat(editor, 'underline')
        }
    };

    const onKeyDown = event => {

        for (const hotkey in HOTKEYS) {
          if (isHotkey(hotkey, event)) {
            event.preventDefault()
            const format = HOTKEYS[hotkey]
            toggleFormat(editor, format)
          }
        }

        if (fullSheetItemSelectedPath && (event.key == "Backspace" || event.key == "Delete")) {
          event.preventDefault();
          Transforms.delete(editor, {at: fullSheetItemSelectedPath});
        }



        // add ref on space if end of line
        if (event.key == " ") {
            getRefInText(editor).then(query =>{
              if (query["is_ref"]){
                Transforms.setNodes(editor, { isRef: true }, {at: editor.selection.focus.path});
                if ((query["is_segment"] || query["is_section"]) ) {
                  insertSource(editor, query["ref"])
                  return
                }
              }
              else {
                Transforms.setNodes(editor, { isRef: false }, {at: editor.selection.focus.path});

              }
            })
        }
    };


    const editor = useMemo(
        () => withSefariaSheet(withLinks(withHistory(withReact(createEditor())))),
        []
    );

    return (
        // Add the editable component inside the context.
        <Slate editor={editor} value={value} onChange={(value) => onChange(value)}>
            <HoverMenu/>
            <Editable
                renderLeaf={props => <Leaf {...props} />}
                renderElement={renderElement}
                spellCheck
                onKeyDown={onKeyDown}
                onDOMBeforeInput={beforeInput}
            />
        </Slate>
    )
};

export default SefariaEditor;
