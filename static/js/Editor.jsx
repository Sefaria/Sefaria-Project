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
    CollectionStatement,
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
    "SheetSource",
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
    DIV: () => ({type: 'paragraph'}),
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
        const textToReturn = el.textContent.replace(/\u2800/g, ''); // this removes the temporary hacky braile character added to render empty paragraphs and br line breaks in parseSheetItemHTML()
        return textToReturn
    } else if (el.nodeType !== 1) {
        return null
    } else if (el.nodeName === 'BR') {
        return null
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

        return (`${tagStringObj.preTags}${content.text.replace(/(\n)+/g, '<br>')}${tagStringObj.postTags}`)
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
        return `<div>${paragraphHTML}</div>`
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
                    heText: parseSheetItemHTML(source.text.he),
                    enText: parseSheetItemHTML(source.text.en),
                    title: null,
                    children: [
                        {text: ""},
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
            const lang = Sefaria.hebrew.isHebrew(source.outsideText) ? 'he' : 'en';

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
    const preparseHtml = rawhtml.replace(/\u00A0/g, ' ').replace(/(\r\n|\n|\r)/gm, "").replace(/(<p><br><\/p>|<p> <\/p>|<div><\/div>|<p><\/p>)/gm, "<div>⠀</div>") // this is an ugly hack that adds the blank braile unicode character to ths string for a moment to ensure that the empty paragraph string gets rendered, this character will be removed later.
    const parsed = new DOMParser().parseFromString(preparseHtml, 'text/html');
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

const defaultEmptyOutsideText = (sheetNodeNumber, textFragment) => {
  return {
            type: "SheetOutsideText",
            node: sheetNodeNumber,
            children: [{
                type: "paragraph",
                children: [{text: textFragment}]
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

    sheet.sources.forEach( (source, i) => {
      // this snippet of code exists to create placeholder spacers inbetween elements to allow for easier editting.
      if (!(i == 0 && sheet.sources[0]["outsideText"]) ) {
          sourceNodes.push({
            type: "spacer",
            children: [{text: ""}]
          })
        }
      //-------//


      sourceNodes.push(
        renderSheetItem(source)
      );


    });

    // Ensure there's always something to edit at bottom of sheet.
    if (sourceNodes.length == 0 || (sourceNodes[sourceNodes.length - 1]["children"][0]["type"] != "SheetOutsideText")) {
        sourceNodes.push({
          type: "spacer",
          children: [{text: ""}]
        })
    }

    let initValue = [
        {
            type: 'Sheet',
            status: sheet.status,
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
            title: sheet.title,
            displayedCollection: sheet.displayedCollection || "",
            collectionName: sheet.collectionName || "",
            collectionImage: sheet.collectionImage || "",
            likes: sheet.likes || [],
            children: [
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

const SheetSourceElement = ({ attributes, children, element }) => {
  const editor = useSlate();

  const sheetSourceEnEditor = useMemo(() => withLinks(withHistory(withReact(createEditor()))), [])
  const sheetSourceHeEditor = useMemo(() => withLinks(withHistory(withReact(createEditor()))), [])
  const [sheetEnSourceValue, sheetEnSourceSetValue] = useState(element.enText)
  const [sheetHeSourceValue, sheetHeSourceSetValue] = useState(element.heText)
  const [unsavedChanges, setUnsavedChanges] = useState(false)
  const [sourceActive, setSourceActive] = useState(false)
  const [activeSourceLangContent, setActiveSourceLangContent] = useState(null)
  const selected = useSelected()
  const focused = useFocused()
  const cancelEvent = (event) => event.preventDefault()

  const onHeChange = (value) => {
    sheetHeSourceSetValue(value)
  }

  const onEnChange = (value) => {
    sheetEnSourceSetValue(value)
  }

  useEffect(
      () => {
        Transforms.setNodes(editor, {heText: sheetHeSourceValue, enText: sheetEnSourceValue}, {at: ReactEditor.findPath(editor, element)});
      },
      [sourceActive]
  );


  const onClick = (e) => {
    if ((e.target).closest('.he') && sourceActive) {
      setActiveSourceLangContent('he')
    }
    else if ((e.target).closest('.en') && sourceActive) {
      setActiveSourceLangContent('en')
    }
    else {
      setActiveSourceLangContent(null)
    }
    setSourceActive(true)
  }

  const onBlur = (e) => {
    setSourceActive(false)
    setActiveSourceLangContent(null)
  }


  const isActive = selected && focused;

  const classes = {SheetSource: 1, segment: 1, selected: isActive };
  const heClasses = {he: 1, selected: isActive, editable: activeSourceLangContent == "he" ? true : false };
  const enClasses = {en: 1, selected: isActive, editable: activeSourceLangContent == "en" ? true : false };

  return (
    <div className={"sheetItem"}>
    {children}
    <div {...attributes} contentEditable={false} onBlur={(e) => onBlur(e) } onClick={(e) => onClick(e)} className={classNames(classes)} style={{"borderColor": Sefaria.palette.refColor(element.ref)}}>
      <div className={classNames(heClasses)} style={{ pointerEvents: (isActive) ? 'auto' : 'none'}}>
        <div className="ref" contentEditable={false} style={{ userSelect: 'none' }}>{element.heRef}</div>
        <div className="sourceContentText">
          <Slate editor={sheetSourceHeEditor} value={sheetHeSourceValue} onChange={value => onHeChange(value)}>
          <HoverMenu/>
            <Editable
              readOnly={!sourceActive}
              renderLeaf={props => <Leaf {...props} />}
            />
          </Slate>
        </div>
      </div>
        {children}
      <div className={classNames(enClasses)} style={{ pointerEvents: (isActive) ? 'auto' : 'none'}}>
        <div className="ref" contentEditable={false} style={{ userSelect: 'none' }}>{element.ref}</div>
        <div className="sourceContentText">
          <Slate editor={sheetSourceEnEditor} value={sheetEnSourceValue} onChange={value => onEnChange(value)}>
          <HoverMenu/>
            <Editable
              readOnly={!sourceActive}
              renderLeaf={props => <Leaf {...props} />}
            />
          </Slate>
        </div>
      </div>
      </div>
      <div className="clearFix"></div>
      </div>
  );
}

const Element = props => {
    const { attributes, children, element } = props
    const sheetItemClasses = `sheetItem ${Node.string(element) ? '':'empty'} ${element.type != ("SheetSource" || "SheetOutsideBiText") ? 'noPointer': ''}`;
    switch (element.type) {
        case 'spacer':
          return (
            <div className="spacer empty">
              {children}
            </div>
          )
        case 'SheetSource':
            return (
              <SheetSourceElement {...props} />
            )

        case 'SheetComment':
            return (
              <div className={sheetItemClasses} {...attributes}>
                <div className="SheetComment segment" {...attributes}>
                    {children}
                </div>
                <div className="clearFix"></div>
              </div>
            )
        case 'SheetOutsideText':
                const SheetOutsideTextClasses = `SheetOutsideText segment ${element.lang}`;
                return (
                  <div className={sheetItemClasses} {...attributes}>
                    <div className={SheetOutsideTextClasses} {...attributes}>
                        {element.loading ? <div className="sourceLoader"></div> : null}
                        {children}
                    </div>
                    <div className="clearFix"></div>
                  </div>
            );

        case 'SheetOutsideBiText':
            return (
              <div className={sheetItemClasses} {...attributes}>
                <div className="SheetOutsideBiText segment" {...attributes}>
                    {children}
                </div>
                <div className="clearFix"></div>
              </div>
            );

        case 'SheetMedia':
            let mediaComponent

            if (element.mediaUrl.match(/\.(jpeg|jpg|gif|png)$/i) != null) {
              mediaComponent = <div className="SheetMedia media"><img className="addedMedia" src={element.mediaUrl} />{children}</div>
            }
            else if (element.mediaUrl.toLowerCase().indexOf('youtube') > 0) {
              mediaComponent = <div className="media fullWidth SheetMedia"><div className="youTubeContainer"><iframe width="100%" height="100%" src={element.mediaUrl} frameBorder="0" allowFullScreen></iframe>{children}</div></div>
            }
            else if (element.mediaUrl.toLowerCase().indexOf('soundcloud') > 0) {
              mediaComponent = <div className="SheetMedia media fullWidth"><iframe width="100%" height="166" scrolling="no" frameBorder="no" src={element.mediaUrl}></iframe>{children}</div>
            }

            else if (element.mediaUrl.match(/\.(mp3)$/i) != null) {
              mediaComponent= <div className="SheetMedia media fullWidth"><audio src={element.mediaUrl} type="audio/mpeg" controls>Your browser does not support the audio element.</audio>{children}</div>
            }

            else {
              mediaComponent = <div className="SheetMedia media fullWidth">{children}</div>
            }

            return (
              <div className={sheetItemClasses} {...attributes}>
                {mediaComponent}
                <div className="clearFix"></div>
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
                <div className="text editorContent" {...attributes}>
                    {children}
                </div>
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
                <div>{children}</div>
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

const getNextSheetItemPath = (SheetItemPath) => {
    let path = SheetItemPath;
    const newLastNode = path.pop() + 1
    path.push(newLastNode);
    return path
};

async function getRefInText(editor, additionalOffset=0) {
  const closestSheetOutsideText = getClosestSheetElement(editor, editor.selection.focus.path, "SheetOutsideText")
  if (!closestSheetOutsideText) {return {}}

  const paragraphsToCheck = Array.from(Editor.nodes(editor, {
    at: closestSheetOutsideText[1],
    match: n => n.type === "paragraph"
  }));

  for (const i of paragraphsToCheck) {

    const initQuery = Node.string(i[0]);
    const paragraphPath = i[1]
    const match = (initQuery.match(/^.+|\n.+/g));
    if (!match) {return {}}

    for (const query of match) {
      if (query.length > 50 || query.trim() == "") {return {}}

      const ref = await Sefaria.getName(encodeURIComponent(query))
      .then(d => {  return d    });

      const selectDistance = query.replace("\n","").length + additionalOffset;



      if (ref["is_ref"]) {
        for (const [node, path] of Node.texts(i[0])) {
          Transforms.setNodes(editor, { isRef: true }, {at: i[1].concat(path)});
        }


        if(ref["is_segment"] || ref["is_section"]) {
          Transforms.select(editor, Editor.end(editor, paragraphPath));
          Transforms.move(editor, { distance: selectDistance, unit: 'character', reverse: true, edge: 'anchor' })
          Editor.removeMark(editor, "isRef")
          Transforms.delete(editor);
          insertSource(editor, ref["ref"], i[1])
        }
        return ref
      }

      else {
        for (const [node, path] of Node.texts(i[0])) {
          Transforms.setNodes(editor, { isRef: false }, {at: i[1].concat(path)});
        }
      }


    }

  }

  return {}



  //return null if query length is too long to be a ref or if query is empty
  // if (query.length > 50 || query == "") {return {}}
  //
  // const ref = await Sefaria.getName(query)
  //     .then(d => {
  //   // If the query isn't recognized as a ref, but only for reasons of capitalization. Resubmit with recognizable caps.
  //   if (Sefaria.isACaseVariant(query, d)) {
  //     this.submitSearch(Sefaria.repairCaseVariant(query, d));
  //     return;
  //   }
  //
  //   return d
  //
  // });
  // return ref
}


const withSefariaSheet = editor => {
    const {insertData, isVoid, normalizeNode} = editor;

    //Hack to override this built-in which often returns null when programmatically selecting the whole SheetSource
    Transforms.deselect = () => {}

    editor.isVoid = element => {
        return (voidElements.includes(element.type)) ? true : isVoid(element)
    };



    editor.insertBreak = () => {

        // if (!Range.isCollapsed(editor.selection)) {
        //     editor.insertText("\n");
        //     return
        // }


        getRefInText(editor).then(query =>{

            if(query["is_segment"] || query["is_section"]) {
              return
            }

            Transforms.insertNodes(editor,{type: 'spacer', children: [{text: ""}]});
            checkAndFixDuplicateSheetNodeNumbers(editor)
            return;

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

    const getNodeAbove = (curPath) => {
      let top = null;
      let topPath = null;
      try {
        topPath = Path.previous(curPath)
        top = (Node.get(editor, topPath))
      }
      catch(err) {}

      return {node: top, path: topPath}
    }

    const getNodeBelow = (curPath) => {
      let bottom = null;
      let bottomPath = null;
      try {
        bottomPath = Path.next(curPath)
        bottom = (Node.get(editor, bottomPath))
      }
      catch(err) {}

      return {node: bottom, path: bottomPath}
    }



    editor.normalizeNode = entry => {
      const [node, path] = entry;

      let sheetElementTypes = Object.values(sheet_item_els);

      if (node.type == "SheetOutsideText") {

        // Autoset language of an outside text for proper RTL/LTR handling
          const content = Node.string(node);
          const lang = Sefaria.hebrew.isHebrew(content) ? 'he' : 'en';
          Transforms.setNodes(editor, { lang: lang }, {at: path});


          //solve issue of children content
          for (const [child, childPath] of Node.children(editor, path)) {

            //if there's raw text, wrap it in a pagraph
            if (child.text) {
            Transforms.wrapNodes(editor,
              {
                  type: "paragraph",
                  children: [child],
                  }
                            ,{ at: childPath })
              return
            }
          }
      }

      if (node.type == "Sheet") {
        // if (node.children.length < 2) {
        //   console.log('bad state -- sheet lost children')
        // }
      }

      if (node.type == "SheetContent") {
        // If sheet elements are in sheetcontent and not wrapped in sheetItem, wrap it.
        for (const [child, childPath] of Node.children(editor, path)) {
          if (child.hasOwnProperty('text')) {

            const fragmentText = child.text
            const fragment = defaultEmptyOutsideText(editor.children[0].nextNode, fragmentText)

            Transforms.delete(editor, {at: childPath});
            Transforms.insertNodes(editor, fragment, { at: childPath });
            incrementNextSheetNode(editor);
            return

          }

          if (child.type == "paragraph") {
            if (Node.string(child) !== "") {

            Transforms.wrapNodes(editor,
              {
                  type: "SheetOutsideText",
                  children: [child],
                  }
                            ,{ at: childPath })
            return
          }
          else {
            Transforms.delete(editor, {at: childPath  });
          }
        }
        }
      }


      if (node.type == "spacer") {

        //Convert a spacer to an outside text if there's text inside it.
        if (Node.string(node) !== "") {

          const fragment = defaultEmptyOutsideText(editor.children[0].nextNode, Node.string(node))
          const atEndOfDoc = Point.equals(editor.selection.focus, Editor.end(editor, [0,0]))

          //This dance is required b/c it can't be changed in place
          // it exits the spacer, deletes it, then places the new outside text in its place
          Transforms.move(editor);
          Transforms.delete(editor, {at: path});
          Transforms.insertNodes(editor, fragment, { at: path });
          incrementNextSheetNode(editor);

          if (atEndOfDoc) {
            // sometimes the delete action above loses the cursor
            //  at the end of the doc, this drops you back in place
            ReactEditor.focus(editor)
            Transforms.select(editor, Editor.end(editor, []));
          }
          else {
            // gain back the cursor position that we exited above
            Transforms.move(editor, { reverse: true })
          }
          return
        }

      //If a spacer gets stuck inside some other element, lift it up to top level
      if (Node.parent(editor, path).type != "SheetContent") {
        Transforms.liftNodes(editor, { at: path })
          return
      }
    }

      // if (node.type == "SheetItem") {
      //   if (node.children[0] && node.children[0].type !== "SheetOutsideText") {
      //     const belowNode = getNodeBelow(path)
      //     const aboveNode = getNodeAbove(path)
      //
      //     if (!belowNode.node) {
      //       Transforms.insertNodes(editor, {type: 'spacer', children: [{text: ""}]}, { at: Editor.end(editor, path) });
      //       return
      //   }
      //     else if (belowNode.node.type !== "spacer") {
      //       Transforms.insertNodes(editor, {type: 'spacer', children: [{text: ""}]}, { at: belowNode.path });
      //       return
      //     }
      //
      //     if (!aboveNode.node) {
      //       Transforms.insertNodes(editor, {type: 'spacer', children: [{text: ""}]}, { at: Editor.start(editor, path) });
      //       return
      //   }
      //     else if (aboveNode.node.type !== "spacer") {
      //       Transforms.insertNodes(editor, {type: 'spacer', children: [{text: ""}]}, { at: aboveNode.path });
      //       return
      //     }
      //   }
      // }

      if (sheetElementTypes.includes(node.type)) {
        //Any nested sheet element should be lifted
        if (Node.parent(editor, path).type !== "SheetContent") {
          Transforms.liftNodes(editor, { at: path })
          return
        }
      }

      if (["SheetSource", "SheetOutsideBiText"].includes(node.type)) {
        //anything pasted into a sheet source object or a sheet outsideBiText will be treated just as text content
        for (const [child, childPath] of Node.children(editor, path)) {
          if (sheetElementTypes.includes(child.type)) {
            Transforms.unwrapNodes(editor, { at: childPath })
            return
          }
        }

        // if source is the first thing added on a page add a spacer above to
        // allow for editting and prevent JS Slate error around addinbg a void
        // as first element in doc.

        if (getNodeAbove(Path.parent(path)).path == null) {
          const fragment = defaultEmptyOutsideText(editor.children[0].nextNode, "")
          incrementNextSheetNode(editor);
          Transforms.insertNodes(editor, fragment, { at: [0,0,0] });
          return
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

      //if a sheetSource is stuck somewhere it shouldnt be raise it up to proper doc level
      if (node.type == "SheetSource" && (Node.parent(editor, path)).type != "SheetContent") {
        Transforms.liftNodes(editor,{ at: path })
        return
      }

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
    // const closestSheetItem = getClosestSheetElement(editor, editor.selection.focus.path, "SheetItem")[1];
    // const nextSheetItemPath = Path.isPath(position) ? position : position == "top" ? closestSheetItem : getNextSheetItemPath(closestSheetItem);
    incrementNextSheetNode(editor);
    Transforms.insertNodes(editor, fragment);
};



const checkAndFixDuplicateSheetNodeNumbers = (editor) => {
  let existingSheetNodes = []
  for (const [child, childPath] of Node.children(editor, [0,0])) {
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
          type: "SheetMedia",
          mediaUrl: mediaUrl,
          node: editor.children[0].nextNode,
          children: [{
                  text: ""
              }]
  };
  addItemToSheet(editor, fragment, "bottom");
  Transforms.move(editor);
}

const insertSource = (editor, ref, path=null) => {

    const currentNode = getClosestSheetElement(editor, path ? path : editor.selection.focus.path, "SheetOutsideText")
    Transforms.setNodes(editor, { loading: true }, {at: currentNode[1]});

    Sefaria.getText(ref).then(text => {
        const enText = Array.isArray(text.text) ? `<p>${text.text.flat(Infinity).join("</p><p>")}</p>` : text.text;
        const heText = Array.isArray(text.text) ? `<p>${text.he.flat(Infinity).join("</p><p>")}</p>` : text.he;

        const fragment = {
                type: "SheetSource",
                node: editor.children[0].nextNode,
                ref: text.ref,
                heRef: text.heRef,
                heText: parseSheetItemHTML(heText),
                enText: parseSheetItemHTML(enText),
                title: null,
                children: [
                    {text: ""},
                ]
        };
        Transforms.setNodes(editor, { loading: false }, { at: currentNode[1] });
        addItemToSheet(editor, fragment, path ? path : "bottom");
        checkAndFixDuplicateSheetNodeNumbers(editor)
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
    const sheetTitle = document.querySelector(".sheetContent .sheetMetaDataBox .title").textContent;

    const sheetContent = doc.children.find(el => el.type == "SheetContent").children;

    const sources = sheetContent.map(item => {
        const sheetItem = item;
        switch (sheetItem.type) {
            case 'SheetSource':

                const enSerializedText = (sheetItem.enText.reduce( (concatenatedSegments, currentSegment) => {
                  return concatenatedSegments + serialize(currentSegment)
                }, "" ) );

                const heSerializedText = (sheetItem.heText.reduce( (concatenatedSegments, currentSegment) => {
                  return concatenatedSegments + serialize(currentSegment)
                }, "" ) );

                let source = {
                    "ref": sheetItem.ref,
                    "heRef": sheetItem.heRef,
                    "text": {
                        "en": enSerializedText !== "" ? enSerializedText : "...",
                        "he": heSerializedText !== "" ? heSerializedText : "...",
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
               //Add space to empty outside texts to preseve line breaks from old sheets.
               return ({
                    "outsideText": (outsideTextText=="<p></p>" || outsideTextText=="<div></div>") ? "<p> </p>" : outsideTextText,
                    "node": sheetItem.node,
                });

            case 'SheetMedia':
                return({
                    "media": sheetItem.mediaUrl,
                    "node": sheetItem.node,
                });

            case 'spacer':
              return;

            default:
                // console.log("Error saving:")
                // console.log(sheetItem)
                return;
        }

    });
    let sheet = {
        status: doc.status,
        id: doc.id,
        promptedToPublish: doc.promptedToPublish,
        lastModified: lastModified,
        summary: doc.summary,
        options: doc.options,
        tags: doc.tags,
        displayedCollection: doc.displayedCollection,
        title: sheetTitle == "" ? "Untitled" : sheetTitle,
        sources: sources.filter(x => !!x),
        nextNode: doc.nextNode,
    };
    // title: sheetTitle == "" ? "Untitled" : sheetTitle,

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
    const [currentSelection, setCurrentSelection] = useState([]);

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
        // console.log('saving...')

        $.post("/api/sheets/", {"json": json}, res => {
            setlastModified(res.dateModified);
            // console.log("saved at: "+ res.dateModified);
            setUnsavedChanges(false)
            Sefaria.sheets._loadSheetByID[doc[0].id] = null
        });
    }

    function onChange(value) {
      if(!ReactEditor.isFocused(editor)) {
        ReactEditor.focus(editor);
        Transforms.select(editor, Editor.end(editor, []));
        // Prevents sources from being selected by clicks outside of editor
        return
      }
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

        // add ref on space if end of line
        if (event.key == " ") {
            getRefInText(editor, 1)
        }
    };


    const editor = useMemo(
        () => withSefariaSheet(withLinks(withHistory(withReact(createEditor())))),
        []
    );

    return (
        <div>
        {
          /* debugger */

          // <div style={{position: 'fixed', left: 0, top: 0, width: 300, height: 1000, backgroundColor: '#ddd', fontSize: 12, zIndex: 9999}}>
          // {JSON.stringify(editor.children[0,0])}
          // </div>

        }

        <SheetMetaDataBox>
            <SheetTitle tabIndex={0} title={sheet.title} editable={true} blurCallback={() => saveDocument(currentDocument)}/>
            <SheetAuthorStatement
                authorUrl={sheet.ownerProfileUrl}
                authorStatement={sheet.ownerName}
            >
              <ProfilePic
                url={sheet.ownerImageUrl}
                len={30}
                name={sheet.ownerName}
                outerStyle={{width: "30px", height: "30px", display: "inline-block", verticalAlign: "middle", marginRight: "10px"}}
              />
              <span>by <a href={sheet.ownerProfileUrl}>{sheet.ownerName}</a></span>
            </SheetAuthorStatement>
            <CollectionStatement
                name={sheet.collectionName}
                slug={sheet.displayedCollection}
                image={sheet.collectionImage}
            />
        </SheetMetaDataBox>

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
        </div>
    )
};

export default SefariaEditor;
