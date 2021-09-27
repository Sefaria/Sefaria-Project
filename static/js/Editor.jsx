import React, {useCallback, useMemo, useState, useEffect, useRef} from 'react';
import {jsx} from 'slate-hyperscript'
import {withHistory} from 'slate-history'
import {Editor, createEditor, Range, Node, Transforms, Path, Text, Point, Element as SlateElement} from 'slate'
import {Slate, Editable, ReactEditor, withReact, useSlate, useSelected, useFocused} from 'slate-react'
import isHotkey from 'is-hotkey'

import Sefaria from './sefaria/sefaria';

import {
    SheetMetaDataBox,
    SheetAuthorStatement,
    SheetTitle,
    CollectionStatement,
    ProfilePic,
    InterfaceText,
    Autocompleter,
} from './Misc';

import classNames from 'classnames';
import $ from "./sefaria/sefariaJquery";
import ReactDOM from "react-dom";

// Mapping from Sheet doc format source types to Slate block element types
const sheet_item_els = {
    ref: 'SheetSource',
    comment: 'SheetOutsideText',
    outsideText: 'SheetOutsideText',
    outsideBiText: 'SheetOutsideBiText',
    media: 'SheetMedia',
};

const voidElements = [
    "ProfilePic",
    "SheetMedia",
    "SheetSource",
    "SheetOutsideBiText",
    "horizontal-line"
];


const HOTKEYS = {
  'mod+b': 'bold',
  'mod+i': 'italic',
  'mod+u': 'underline',
};

const LIST_TYPES = ['numbered-list', 'bulleted-list']

const NO_SPACER_NEEDED_TYPES = ["SheetOutsideText", "header", "SheetComment", "list-item", "numbered-list", "bulleted-list"]

const ELEMENT_TAGS = {
    A: el => ({type: 'link', url: el.getAttribute('href'), ref: el.getAttribute('data-ref'), target: el.getAttribute('target')}),
    BLOCKQUOTE: () => ({type: 'quote'}),
    H1: () => ({type: 'header'}),
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
    TABLE: () => ({type: 'table'}),
    TR: () => ({type: 'table-row'}),
    TD: () => ({type: 'table-cell'}),
    HR: () => ({type: 'horizontal-line'}),
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
        tag: "SUP",
        format: "superscript"
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

const special_styles_to_care_about = [
  "background-color",
  "color",
  "text-align"
];


const TEXT_TAGS = format_tag_pairs.reduce((obj, item) => {
     obj[item.tag] = () => ({[item.format]: true })
     return obj
   }, {});

const format_to_html_lookup = format_tag_pairs.reduce((obj, item) => {
     obj[item.format] = item.tag;
     return obj
   }, {});


 const getNodeAbove = (curPath, editor) => {
   let top = null;
   let topPath = null;
   try {
     topPath = Path.previous(curPath)
     top = (Node.get(editor, topPath))
   }
   catch(err) {}

   return {node: top, path: topPath}
 };

 const getNodeBelow = (curPath, editor) => {
   let bottom = null;
   let bottomPath = null;
   try {
     bottomPath = Path.next(curPath)
     bottom = (Node.get(editor, bottomPath))
   }
   catch(err) {}

   return {node: bottom, path: bottomPath}
 };


export const deserialize = el => {
    if (el.nodeType === 3) {
        return el.textContent
    } else if (el.nodeType !== 1) {
        return null
    } else if (el.nodeName === 'BR') {
        return null
    }

    const checkForStyles = () => {
        if (el.getAttribute("style")) {
          const elStyles = el.getAttribute("style").split(';');
          let addlAttrs = {}
          for (const elStyle of elStyles) {
            const styleArray = elStyle.split(":");
            if (styleArray.length == 2) {
              const styleType = styleArray[0].trim()
              const styleValue = styleArray[1].trim()
              addlAttrs[styleType] = styleValue
            }
          }
        return addlAttrs
        }
    };

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
        let new_children = children
        if(!children[0]) {
            new_children = [{'text':''}]
        }
        const attrs = {
            ...ELEMENT_TAGS[nodeName](el),
            ...checkForStyles()
        };
        return jsx('element', attrs, new_children)
    }

    if (TEXT_TAGS[nodeName]) {
      const attrs = TEXT_TAGS[nodeName](el);
      return children.map(child => jsx('text', attrs, ((typeof child === "string" || Text.isText(child)) ? child : Node.string(child))))
    }

    if (el.getAttribute("style")) {
      const elStyles = el.getAttribute("style").split(';');
      for (const elStyle of elStyles) {
        const styleArray = elStyle.split(":");
        console.log(styleArray)
        if (styleArray.length == 2) {
          const styleType = styleArray[0].trim()
          const styleValue = styleArray[1].trim()
          let attrs = {}
          attrs[styleType] = styleValue

          return children.map(child => child ? jsx('text', attrs, ((typeof child === "string" || Text.isText(child)) ? child : Node.string(child))): {'text':''})
        }
      }
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
            else if (special_styles_to_care_about.includes(key)) {
              const preTag = (tagString.preTags + `<span style=${key}:${content[key]}>`);
              const postTag = ("</span>" + tagString.postTags);
              return {preTags: preTag.toLowerCase(), postTags: postTag.toLowerCase()}
            }
            return {preTags: tagString.preTags, postTags: tagString.postTags}
        }, {preTags: "", postTags: ""});

        return (`${tagStringObj.preTags}${content.text.replace(/(\n)+/g, '<br>')}${tagStringObj.postTags}`)
    }

    if (content.type) {

        switch (content.type) {
            case 'link': {
                const linkHTML = content.children.reduce((acc, text) => {
                    return (acc + serialize(text))
                }, "");

                return (content.ref ?
                    `<a href="${content.url}" class="refLink" data-ref="${content.ref}">${linkHTML}</a>`
                    : `<a href="${content.url}">${linkHTML}</a>`)
            }

            case 'paragraph': {
                const paragraphHTML = content.children.reduce((acc, text) => {
                    return (acc + serialize(text))
                }, "");
                if (content["text-align"] == "center") {
                    return `<div style='text-align: center'>${paragraphHTML}</div>`
                }
                return `<div>${paragraphHTML}</div>`
            }

            case 'list-item': {
                const liHtml = content.children.reduce((acc, text) => {
                    return (acc + serialize(text))
                }, "");
                return `<li>${liHtml}</li>`
            }

            case 'numbered-list': {
                const olHtml = content.children.reduce((acc, text) => {
                    return (acc + serialize(text))
                }, "");
                return `<ol>${olHtml}</ol>`
            }

            case 'bulleted-list': {
                const ulHtml = content.children.reduce((acc, text) => {
                    return (acc + serialize(text))
                }, "");
                return `<ul>${ulHtml}</ul>`
            }
            case 'table':
              const tableHtml = content.children.reduce((acc, text) => {
                  return (acc + serialize(text))
              }, "");
              return (
                `<table><tbody>${tableHtml}</tbody></table>`
              )

            case 'table-row':
              const trHtml = content.children.reduce((acc, text) => {
                  return (acc + serialize(text))
              }, "");
              return `<tr>${trHtml}</tr>`

            case 'table-cell':
              const tdHtml = content.children.reduce((acc, text) => {
                  return (acc + serialize(text))
              }, "");
              return `<td>${tdHtml}</td>`

            case 'horizontal-line':
              return `<hr>`

        }
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
                    options: source.options,
                    children: [
                        {text: ""},
                    ]
                }
            );
            return content
        }
        case 'comment': {
            const commentLang = Sefaria.hebrew.isHebrew(source.comment) ? 'he' : 'en';
            const content = (
                {
                    type: sheet_item_els[sheetItemType],
                    options: source.options,
                    children: parseSheetItemHTML(source.comment),
                    node: source.node,
                    lang: commentLang
                }
            );
            return content
        }
        case 'outsideText': {
            const lang = Sefaria.hebrew.isHebrew(source.outsideText) ? 'he' : 'en';

            const content = (
                {
                    type: sheet_item_els[sheetItemType],
                    options: source.options,
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
                    heText: parseSheetItemHTML(source.outsideBiText.he),
                    enText: parseSheetItemHTML(source.outsideBiText.en),
                    options: source.options,
                    children: [
                        {text: ""},
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
                    options: source.options,
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
          console.log(source);
            return {
                text: "",
            }
        }
    }
}

function parseSheetItemHTML(rawhtml) {
    const preparseHtml = rawhtml.replace(/\u00A0/g, ' ').replace(/(\r\n|\n|\r)/gm, "");
    const parsed = new DOMParser().parseFromString(preparseHtml, 'text/html');
    const fragment = deserialize(parsed.body);
    const slateJSON = fragment.length > 0 ? fragment : [{text: ''}];
    return slateJSON[0].type === 'paragraph' ? slateJSON : [{type: 'paragraph', children: slateJSON}]
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
};


function transformSheetJsonToSlate(sheet) {
    const sheetTitle = sheet.title.stripHtmlConvertLineBreaks();

    let curNextNode = sheet.nextNode;

    let sourceNodes = [];

    sheet.sources.forEach( (source, i) => {

        // this snippet of code exists to create placeholder spacers in between elements to allow for easier editing
        // and to preserve spacing.
        //
        // A spacer is added:
        // 1. If the source is not the first source and it's not an outside text or adjacent to an outside text, and
        // 2. In between outside texts.

      // needed for now b/c headers are saved as OutsideTexts for backwards compatability w/ old sheets
      const sourceIsHeader = source["outsideText"] && source["outsideText"].startsWith("<h1>");
      const isCurrentSourceAnOutsideText = !!source["outsideText"];
      const isPrevSourceAnOutsideText = !!(i > 0 && sheet.sources[i-1]["outsideText"]);

      if (!(isPrevSourceAnOutsideText || isCurrentSourceAnOutsideText) || (isPrevSourceAnOutsideText && isCurrentSourceAnOutsideText && !sourceIsHeader) ) {
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
    if (sourceNodes.length == 0 || (sourceNodes[sourceNodes.length - 1]["children"] && sourceNodes[sourceNodes.length - 1]["children"][0]["type"] != "SheetOutsideText")) {
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
  if (editor.edittingSource) {return true}

  const isEditable = (Range.isRange(editor.selection) && !Range.isCollapsed(editor.selection))
  editor.edittingSource = isEditable;
  return (isEditable)
}

const BoxedSheetElement = ({ attributes, children, element }) => {
  const parentEditor = useSlate();

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
        Transforms.setNodes(parentEditor, {heText: sheetHeSourceValue, enText: sheetEnSourceValue}, {at: ReactEditor.findPath(parentEditor, element)});
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

    const onKeyDown = (event, editor) => {
        for (const hotkey in HOTKEYS) {
            if (isHotkey(hotkey, event)) {
                event.preventDefault();
                const format = HOTKEYS[hotkey];
                console.log(format)
                toggleFormat(editor, format)
            }
        }
    }

  const isActive = selected;
  const sheetItemClasses = {sheetItem: 1, highlight: parentEditor.highlightedNode == element.node}
  const classes = {
      SheetSource: element.ref ? 1 : 0,
      SheetOutsideBiText: element.ref ? 0 : 1,
      segment: 1,
      selected: isActive
  };
  const heClasses = {he: 1, selected: isActive, editable: activeSourceLangContent == "he" ? true : false };
  const enClasses = {en: 1, selected: isActive, editable: activeSourceLangContent == "en" ? true : false };

  return (
    <div className={classNames(sheetItemClasses)} data-sheet-node={element.node} data-sefaria-ref={element.ref} style={{ pointerEvents: (isActive) ? 'none' : 'auto'}}>
    <div {...attributes} contentEditable={false} onBlur={(e) => onBlur(e) } onClick={(e) => onClick(e)} className={classNames(classes)} style={{"borderInlineStartColor": Sefaria.palette.refColor(element.ref)}}>
      <div className={classNames(heClasses)} style={{ pointerEvents: (isActive) ? 'auto' : 'none'}}>
          {element.heRef ? <div className="ref" contentEditable={false} style={{ userSelect: 'none' }}>{element.heRef}</div> : null }
          <div className="sourceContentText">
          <Slate editor={sheetSourceHeEditor} value={sheetHeSourceValue} onChange={value => onHeChange(value)}>
          <HoverMenu buttons="basic"/>
            <Editable
              readOnly={!sourceActive}
              renderLeaf={props => <Leaf {...props} />}
              onKeyDown={(e) => onKeyDown(e, sheetSourceHeEditor)}

            />
          </Slate>
        </div>
      </div>
      <div className={classNames(enClasses)} style={{ pointerEvents: (isActive) ? 'auto' : 'none'}}>
        {element.ref ? <div className="ref" contentEditable={false} style={{ userSelect: 'none' }}>{element.ref}</div> : null }
        <div className="sourceContentText">
          <Slate editor={sheetSourceEnEditor} value={sheetEnSourceValue} onChange={value => onEnChange(value)}>
          <HoverMenu buttons="basic"/>
            <Editable
              readOnly={!sourceActive}
              renderLeaf={props => <Leaf {...props} />}
              onKeyDown={(e) => onKeyDown(e, sheetSourceEnEditor)}
            />
          </Slate>
        </div>
      </div>
      </div>
      <div className="clearFix"></div>
      {children}
      </div>
  );
};

const AddInterfaceInput = ({ inputType, resetInterface }) => {
    const editor = useSlate();
    const [inputValue, setInputValue] = useState("");
    const [showAddMediaButton, setShowAddMediaButton] = useState(false);

    const isMediaLink = (url) => {
        console.log(url)

      if (url.match(/^https?/i) == null) {
        return null;
      }
      const youtube_re = /https?:\/\/(www\.)?(youtu(?:\.be|be\.com)\/(?:.*v(?:\/|=)|(?:.*\/)?)([\w'-]+))/i;
      let vimeo_re = /^.*(vimeo\.com\/)((channels\/[A-z]+\/)|(groups\/[A-z]+\/videos\/)|(video\/))?([0-9]+)/;
      let m;
      if ((m = youtube_re.exec(url)) !== null) {
        if (m.index === youtube_re.lastIndex) {
          youtube_re.lastIndex++;
        }
        if (m.length>0) {
            return "https://www.youtube.com/embed/"+m[m.length-1]+"?rel=0&amp;showinfo=0";
        }
      }
      else if ((m = vimeo_re.exec(url)) !== null) {
          if (m.index === vimeo_re.lastIndex) {
              vimeo_re.lastIndex++;
          }
          if (m.length > 0) {
              return "https://player.vimeo.com/video/" + m[6];
          }
    } else if (url.match(/^https?:\/\/(www\.)?.+\.(jpeg|jpg|gif|png)$/i) != null) {
        return url;
      } else if (url.match(/^https?:\/\/(www\.)?.+\.(mp3)$/i) != null) {
        return url;
      } else if (url.match(/^https?:\/\/(www\.|m\.)?soundcloud\.com\/[\w\-\.]+\/[\w\-\.]+\/?/i) != null) {
        return 'https://w.soundcloud.com/player/?url='+ url + '&amp;color=ff5500&amp;auto_play=false&amp;hide_related=true&amp;show_comments=false&amp;show_user=true&amp;show_reposts=false';
      } else {
        return false
      }
    }

    const onMediaChange = (e) => {
        const newValue = e.target.value;
        setInputValue(newValue)
        setShowAddMediaButton(isMediaLink(newValue))
    }
    const addMedia = () => {
        const fragment = {
            type: "SheetMedia",
            mediaUrl: isMediaLink(inputValue),
            node: editor.children[0].nextNode,
            children: [{text: ""}]
        };
        incrementNextSheetNode(editor);
        Transforms.insertNodes(editor, fragment);
        Editor.normalize(editor, { force: true })
        Transforms.move(editor);
    }

    const selectedRefCallback = (ref) => {
          insertSource(editor, ref)
    }


    if (inputType == "media") {
        return (
            <div className="addInterfaceInput mediaInput" title="We can process YouTube and SoundCloud links, and hosted mp3's and images" onClick={(e)=> {e.stopPropagation()}}>
                <input
                    type="text"
                    placeholder="Paste a media link..."
                    className="serif"
                    onClick={(e)=> {e.stopPropagation()}}
                    onChange={(e) => onMediaChange(e)}
                    value={inputValue}
                />
                {showAddMediaButton ? <button className="button small" onClick={(e) => {
                    addMedia()
                }}>Add Media</button> : null}
            </div>
        )
    }

    else if (inputType == "source") {
        return (
            <Autocompleter
                selectedRefCallback={selectedRefCallback}
            />
        )
    }

        else {return(null)}

}

const AddInterface = ({ attributes, children, element }) => {
    const editor = useSlate();
    const [active, setActive] = useState(false)
    const [itemToAdd, setItemToAdd] = useState(null)

    const resetInterface = () => {
        setActive(false);
        setItemToAdd(null);
    }


    const toggleEditorAddInterface = (e) => {
        setActive(!active)
        setItemToAdd(null);

    }
    const addInterfaceClasses = {
        active: active,
        editorAddInterface: 1,
    };

    const addSourceClicked = (e) => {
        e.stopPropagation();
        setItemToAdd('source');
          // Timeout required b/c it takes a moment for react to rerender before focusing on the new input
          setTimeout(() => {
              document.querySelector(".addInterfaceInput input").focus()
          }, 100);

    }

    const addMediaClicked = (e) => {
        e.stopPropagation();
        setItemToAdd("media");
          // Timeout required b/c it takes a moment for react to rerender before focusing on the new input
          setTimeout(() => {
              document.querySelector(".addInterfaceInput input").focus()
          }, 100);
    }

    const addImageClicked = (e) => {
        e.stopPropagation();
        setItemToAdd(null);
        setActive(!active)
    }
    const fileInput = useRef(null);

    const uploadImage = (imageData) => {
        const formData = new FormData();
        formData.append('file', imageData.replace(/data:image\/(jpe?g|png|gif);base64,/, ""));
        // formData.append('file', imageData);

        $.ajax({
            url: Sefaria.apiHost + "/api/sheets/upload-image",
            type: 'POST',
            data: formData,
            contentType: false,
            processData: false,
            success: function(data) {
                console.log(data.url)
                insertMedia(editor, data.url)
            },
            error: function(e) {
                console.log("photo upload ERROR", e);
            }
        });
    };

    const onFileSelect = (e) => {
        const file = fileInput.current.files[0];
        if (file == null)
        return;
            if (/\.(jpe?g|png|gif)$/i.test(file.name)) {
                const reader = new FileReader();

                reader.addEventListener("load", function() {
                  uploadImage(reader.result);
                }, false);

                reader.addEventListener("onerror", function() {
                  alert(reader.error);
                }, false);

                reader.readAsDataURL(file);
            } else {
              alert('not an image');
            }
    }

    return (
      <div role="button" title={active ? "Close menu" : "Add a source, image, or other media"} contentEditable={!active} suppressContentEditableWarning={true} aria-label={active ? "Close menu" : "Add a source, image, or other media"} className={classNames(addInterfaceClasses)} onClick={(e) => toggleEditorAddInterface(e)}>
          {itemToAdd == null ? <>
              <div role="button" title="Add a source" aria-label="Add a source" className="editorAddInterfaceButton" contentEditable={false} onClick={(e) => addSourceClicked(e)} id="addSourceButton"></div>
              <div role="button" title="Add an image" aria-label="Add an image" className="editorAddInterfaceButton" contentEditable={false} onClick={(e) => addImageClicked(e)} id="addImageButton">
                  <label htmlFor="addImageFileSelector" id="addImageFileSelectorLabel"></label>
              </div>
              <input id="addImageFileSelector" type="file" style={{ display: "none"}} onChange={onFileSelect} ref={fileInput} />
              <div role="button" title="Add media" aria-label="Add media" className="editorAddInterfaceButton" contentEditable={false} onClick={(e) => addMediaClicked(e)} id="addMediaButton"></div>
          </> :

              <AddInterfaceInput
                inputType={itemToAdd}
                resetInterface={resetInterface}
              />

          }
          <div className="cursorHolder" contentEditable={true} suppressContentEditableWarning={true}>{children}</div>
      </div>
    )
}

const Element = props => {
    const { attributes, children, element } = props;
    const sheetItemClasses = {
        sheetItem: 1,
        empty: !(Node.string(element)),
        noPointer: ["SheetSource", "SheetOutsideBiText"].indexOf(element.type) === -1,
        highlight: (useSlate().highlightedNode === element.node)
    };

    switch (element.type) {
        case 'spacer':
          const spacerSelected = useSelected();
          return (
            <div className="spacer empty">
              {spacerSelected ? <AddInterface {...props} /> : <>{children}</>}

            </div>
          );
        case 'SheetSource':
            return (
              <BoxedSheetElement {...props} />
            );

        case 'SheetOutsideBiText':
            return (
              <BoxedSheetElement {...props} />
            );


        case 'SheetComment':
            return (
              <div className={classNames(sheetItemClasses)} {...attributes} data-sheet-node={element.node}>
                <div className="SheetComment segment" {...attributes}>
                    {children}
                </div>
                <div className="clearFix"></div>
              </div>
            );
        case 'SheetOutsideText':
                const SheetOutsideTextClasses = `SheetOutsideText segment ${element.lang}`;
                return (
                  <div className={classNames(sheetItemClasses)} {...attributes} data-sheet-node={element.node}>
                    <div className={SheetOutsideTextClasses} {...attributes}>
                        {children}
                    </div>
                    <div className="clearFix"></div>
                  </div>
            );


        case 'SheetMedia':
            let mediaComponent
            let vimeoRe = /^.*(vimeo\.com\/)((channels\/[A-z]+\/)|(groups\/[A-z]+\/videos\/)|(video\/))?([0-9]+)/;        
            if (element.mediaUrl.match(/\.(jpeg|jpg|gif|png)$/i) != null) {
              mediaComponent = <div className="SheetMedia media"><img className="addedMedia" src={element.mediaUrl} />{children}</div>
            }
            else if (element.mediaUrl.match(/https?:\/\/www\.youtube\.com\/embed\/.+?rel=0&amp;showinfo=0$/i) != null) {
              mediaComponent = <div className="media fullWidth SheetMedia"><div className="youTubeContainer"><iframe width="100%" height="100%" src={element.mediaUrl} frameBorder="0" allowFullScreen></iframe>{children}</div></div>
            }
            else if (vimeoRe.exec(element.mediaUrl) !== null) {
                mediaComponent = <iframe width="560" height="315" src={element.mediaUrl} frameborder="0" allow="autoplay; fullscreen" allowfullscreen></iframe>;
            }
            else if (element.mediaUrl.match(/https?:\/\/w\.soundcloud\.com\/player\/\?url=.*/i) != null) {
              mediaComponent = <div className="SheetMedia media fullWidth"><iframe width="100%" height="166" scrolling="no" frameBorder="no" src={element.mediaUrl}></iframe>{children}</div>
            }
            else if (element.mediaUrl.match(/\.(mp3)$/i) != null) {
              mediaComponent= <div className="SheetMedia media fullWidth"><audio src={element.mediaUrl} type="audio/mpeg" controls>Your browser does not support the audio element.</audio>{children}</div>
            }
            else {
              mediaComponent = <div className="SheetMedia media fullWidth">{children}</div>
            }

            return (
              <div className={classNames(sheetItemClasses)} {...attributes} data-sheet-node={element.node}>
                {mediaComponent}
                <div className="clearFix"></div>
              </div>
            );

        case 'he':
            const heSelected = useSelected();
            const heEditable = useSlate().edittingSource;
            const heClasses = {he: 1, editable: heEditable, selected: heSelected };
            return (
                <div className={classNames(heClasses)}>
                    {children}
                </div>
            );
        case 'en':
            const enSelected = useSelected();
            const enEditable = useSlate().edittingSource;
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
            const pClasses = {center: element["text-align"] == "center" };
            return (
                <div className={classNames(pClasses)}>
                    {element.loading ? <div className="sourceLoader"></div> : null}
                    {children}
                </div>
            );
        case 'bulleted-list':
            return (
                <ul>{children}</ul>
            );
        case 'numbered-list':
            return (
                <ol>{children}</ol>
            );

        case 'list-item':
            return (
                <li>{children}</li>
            );
        case 'header': {
            return <h1 className="serif" {...attributes}><span>{children}</span></h1>
        }
        case 'link':
          return (
            <Link {...props} />
          )
        case 'table':
          return (
            <table>
              <tbody {...attributes}>{children}</tbody>
            </table>
          )
        case 'table-row':
          return <tr {...attributes}>{children}</tr>
        case 'table-cell':
          return <td {...attributes}>{children}</td>
        case 'horizontal-line':
          return <>{children}<hr contentEditable={false} style={{ userSelect: 'none' }} /></>
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

async function getRefInText(editor, returnSourceIfFound) {

  const closestSheetOutsideText = getClosestSheetElement(editor, editor.selection.focus.path, "SheetOutsideText")
  if (!closestSheetOutsideText) {return {}}

  const paragraphsToCheck = Array.from(Editor.nodes(editor, {
    at: closestSheetOutsideText[1],
    match: n => n.type === "paragraph"
  }));

  for (const i of paragraphsToCheck) {
    const initQuery = Node.string(i[0]);
    const paragraphPath = i[1]
    const match = (initQuery.match(/^.+|\n.+|^$/g));
    if (!match) {continue}

    for (const query of match) {
      if (query.length > 50 || query.trim() == "") {continue}

      const ref = await Sefaria.getName(query.replace(/[\.:]$/, ""))
      .then(d => {  return d    });

      const selectDistance = query.replace("\n","").length;

      if (ref["is_ref"]) {
        for (const [node, path] of Node.texts(i[0])) {
          Transforms.setNodes(editor, { isRef: true }, {at: i[1].concat(path)});
        }


        if(returnSourceIfFound && (ref["is_segment"] || ref["is_section"])) {
          Transforms.select(editor, Editor.end(editor, paragraphPath));
          Transforms.move(editor, { distance: selectDistance, unit: 'character', reverse: true, edge: 'anchor' })
          Editor.removeMark(editor, "isRef")
          Transforms.delete(editor);
          insertSource(editor, ref["ref"])
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
}


const withSefariaSheet = editor => {
    const {insertData, insertBreak, isVoid, normalizeNode, deleteBackward, setFragmentData} = editor;

    //Hack to override this built-in which often returns null when programmatically selecting the whole SheetSource
    Transforms.deselect = () => {
    };

    editor.isVoid = element => {
        return (voidElements.includes(element.type)) ? true : isVoid(element)
    };


    editor.deleteBackward = () => {
        const atStartOfDoc = Point.equals(editor.selection.focus, Editor.start(editor, [0, 0]));
        const atEndOfDoc = Point.equals(editor.selection.focus, Editor.end(editor, [0, 0]));
        if (atStartOfDoc) {
            return
        }

        //if selected element is sheet source, delete it as normal
        if (getClosestSheetElement(editor, editor.selection.focus.path, "SheetSource")) {
            deleteBackward();
            return
        } else {
            //check to see if we're in a spacer to apply special delete rules
            let inSpacer = false;
            if (getClosestSheetElement(editor, editor.selection.focus.path, "spacer")) {
                inSpacer = true;
            }

            if (atEndOfDoc && inSpacer) {
                Transforms.move(editor, {reverse: true})
                return
            }

            //we do a dance to see if we'll accidently delete a sheetsource and select it instead if we will
            Transforms.move(editor, {reverse: true})
            if (getClosestSheetElement(editor, editor.selection.focus.path, "SheetSource")) {
                //deletes the extra spacer space that would otherwise be left behind
                if (inSpacer) {
                    Transforms.move(editor, {distance: 2});
                    if (getClosestSheetElement(editor, editor.selection.focus.path, "SheetSource")) {
                            Transforms.move(editor, {reverse: true, distance: 2})
                    }
                    else {
                        deleteBackward();
                    }
                }
                return
            } else {
                Editor.deleteForward(editor);
                return;
            }
        }
    };

    editor.setFragmentData = (data) => {
        setFragmentData(data);
        //dance required to ensure a cut source is properly deleted when the delete part of cut is fired
        if (editor.cuttingSource) {
            Transforms.move(editor, {distance: 1, unit: 'character', edge: 'anchor'});
            Transforms.move(editor, {distance: 1, unit: 'character', reverse: true, edge: 'focus'});
            editor.cuttingSource = false
        }
    };

    editor.insertBreak = () => {

        // if enter in middle of line in SheetOutsideText insert soft break
        if (getClosestSheetElement(editor, editor.selection.focus.path, "SheetOutsideText") &&
            !Point.equals(editor.selection.focus, Editor.end(editor, editor.selection.focus.path))) {
            insertBreak();
            return
        }

        if (getClosestSheetElement(editor, editor.selection.focus.path, "header")) {
            insertBreak();
            const curHeaderPath = getClosestSheetElement(editor, editor.selection.focus.path, "header")[1]
            Transforms.setNodes(editor, {type: "SheetOutsideText"}, {at: curHeaderPath});
            return
        }

        const isListItemAndNotEmpty = editor => {
          const [list] = Editor.nodes(editor, { match: n => LIST_TYPES.includes(!Editor.isEditor(n) && SlateElement.isElement(n) && n.type)})
          const curNode = Node.get(editor, editor.selection.focus.path);
            if (list && Node.string(curNode) !== "") {return true}
            else {return false}
        };

        if (isListItemAndNotEmpty(editor)) {
            insertBreak();
            return
        }

        getRefInText(editor, true).then(query => {
            if (query["is_segment"] || query["is_section"]) {
                return
            }
            Transforms.insertNodes(editor, {type: 'spacer', children: [{text: ""}]});
            checkAndFixDuplicateSheetNodeNumbers(editor);
            return;

        })
    };


    editor.insertData = data => {
        insertData(data);
        checkAndFixDuplicateSheetNodeNumbers(editor);
    };


    editor.normalizeNode = entry => {
        const [node, path] = entry;

        const normalizers = [
            editor.decorateSheetOutsideText,
            editor.wrapSheetOutsideTextChildren,
            editor.mergeSheetOutsideTextBlocks,
            editor.convertEmptyOutsideTextIntoSpacer,
            editor.convertEmptyParagraphToSpacer,
            editor.wrapSheetContentElements,
            editor.ensureEditableSpaceAtTopAndBottom,
            editor.replaceSpacerWithOutsideText,
            editor.liftSpacer,
            editor.ensureNodeId,
            editor.liftSheetElement,
            editor.enforceTextOnlyInBoxedSheetElement,
            editor.ensureEditableSpaceBeforeAndAfterBoxedElements,
            editor.onlyTextAndRefsInBoxedElements,
            editor.addPlaceholdersForEmptyText,
            editor.liftHeader,

        ];

        for (let normalizer of normalizers) {
            const changeWasMade = normalizer(node, path);
            if (changeWasMade) return;
        }

        // Fall back to the original `normalizeNode` to enforce other constraints.
        normalizeNode(entry);
    };

    // Normalization functions take (node, path) and return true if they make a change.
    // They are registered in editor.normalizeNode

    editor.liftHeader = (node, path) => {
        if (node.type === "header") {
            if (Node.parent(editor, path).type !== "SheetContent") {
                Transforms.setNodes(editor, {node: editor.children[0].nextNode}, {at: path});
                incrementNextSheetNode(editor)
                Transforms.liftNodes(editor, {at: path});
                return true;
            }
        }
    }

    editor.decorateSheetOutsideText = (node, path) => {
        // Autoset language of an outside text for proper RTL/LTR handling
        if (node.type === "SheetOutsideText") {
            const content = Node.string(node);
            const lang = Sefaria.hebrew.isHebrew(content) ? 'he' : 'en';
            Transforms.setNodes(editor, {lang: lang}, {at: path});
        }
    };

    editor.wrapSheetOutsideTextChildren = (node, path) => {
        // Ensure all texts in SheetOutsideText are wrapped in paragraph block
        if (node.type === "SheetOutsideText") {

            //solve issue of children content
            for (const [child, childPath] of Node.children(editor, path)) {

                //if there's raw text, wrap it in a paragraph
                if (child.text) {
                    Transforms.wrapNodes(
                        editor,
                        {
                            type: "paragraph",
                            children: [child],
                        },
                        {at: childPath}
                    );
                    return true;
                }
            }
        }
    };

    editor.mergeSheetOutsideTextBlocks = (node, path) => {
        // Merge adjacent SheetOutsideText blocks into one
        if (node.type === "SheetOutsideText") {

            //merge with adjacent outside texts:
            const nodeAbove = getNodeAbove(path, editor);
            const nodeBelow = getNodeBelow(path, editor);

            if (nodeAbove.node && nodeAbove.node.type === "SheetOutsideText") {
                Transforms.mergeNodes(editor, {at: path});
                return true;
            }
            if (nodeBelow.node && nodeBelow.node.type === "SheetOutsideText") {
                Transforms.mergeNodes(editor, {at: nodeBelow.path})
                return true;
            }
        }
    };

    editor.convertEmptyParagraphToSpacer = (node, path) => {
        if (node.type === "paragraph") {
            if (Node.string(node) === "" && node.children.length <= 1) {
                Transforms.setNodes(editor, {type: "spacer"}, {at: path});
            }
        }
    }

    editor.convertEmptyOutsideTextIntoSpacer = (node, path) => {
        if (node.type === "SheetOutsideText") {
            if (Node.string(node) === "" && node.children.length <= 1) {
                Transforms.setNodes(editor, {type: "spacer"}, {at: path});
            }
        }
    };

    // If sheet elements are in sheetcontent and not wrapped in sheetItem, wrap it.
    editor.wrapSheetContentElements = (node, path) => {
        if (node.type === "SheetContent") {
            for (const [child, childPath] of Node.children(editor, path)) {
                // If it's raw text, covert to SheetOutsideText
                if (child.hasOwnProperty('text')) {

                    const fragmentText = child.text;
                    const fragment = defaultEmptyOutsideText(editor.children[0].nextNode, fragmentText);

                    Transforms.delete(editor, {at: childPath});
                    Transforms.insertNodes(editor, fragment, {at: childPath});
                    incrementNextSheetNode(editor);
                    return true;

                }

                if (LIST_TYPES.includes(child.type)) {
                    Transforms.wrapNodes(editor,
                        {
                            type: "paragraph",
                            children: [child],
                        }
                        , {at: childPath});
                    return true;
                }

                // If it's a paragraph, covert to SheetOutisdeText
                if (child.type === "paragraph") {
                    if (Node.string(child) !== "") {

                        Transforms.wrapNodes(editor,
                            {
                                type: "SheetOutsideText",
                                children: [child],
                            }
                            , {at: childPath});
                        return true;
                    } else {
                        // It's not text or paragraph.  It's probably a null element.  Nuke it.
                        Transforms.delete(editor, {at: childPath});
                        return true;
                    }
                }
            }
        }
    };

    editor.ensureEditableSpaceAtTopAndBottom = (node, path) => {
        if (node.type === "SheetContent") {
            //ensure there's always an editable space for a user to type at end and top of sheet
            const lastSheetItem = node.children[node.children.length - 1];
            if (lastSheetItem.type !== "spacer" && !NO_SPACER_NEEDED_TYPES.includes(lastSheetItem.type)) {
                Transforms.insertNodes(editor, {
                    type: 'spacer',
                    children: [{text: ""}]
                }, {at: Editor.end(editor, [0, 0])});
                return true;
            }

            const firstSheetItem = node.children[0];
            if (firstSheetItem.type !== "spacer" && !NO_SPACER_NEEDED_TYPES.includes(firstSheetItem.type)) {
                console.log(firstSheetItem)
                Transforms.insertNodes(editor, {type: 'spacer', children: [{text: ""}]}, {at: [0, 0, 0]});
                return true;
            }
        }
    };

    //Convert a spacer to an outside text if there's text inside it.
    editor.replaceSpacerWithOutsideText = (node, path) => {
        if (node.type === "spacer") {
            if (Node.string(node) !== "") {
                Transforms.setNodes(editor, {type: "SheetOutsideText", node: node.node}, {at: path});
            }
        }
    };

    //If a spacer gets stuck inside some other element, lift it up to top level
    editor.liftSpacer = (node, path) => {
        if (node.type === "spacer") {
            if (Node.parent(editor, path).type !== "SheetContent") {
                Transforms.liftNodes(editor, {at: path});
                return true;
            }
        }
    };

    // Ensure all SheetItems have node #
    editor.ensureNodeId = (node, path) => {
        const sheetElementTypes = Object.values(sheet_item_els);

        if (sheetElementTypes.includes(node.type)) {
            if (!node.node) {
                Transforms.setNodes(editor, {node: editor.children[0].nextNode}, {at: path});
                incrementNextSheetNode(editor)
            }
        }
    }

    // If a sheet element gets stuck inside some other element, lift it up to top level
    editor.liftSheetElement = (node, path) => {
        // SheetSource, SheetComment, SheetOutsideText, SheetOutsideBiText, SheetMedia
        const sheetElementTypes = Object.values(sheet_item_els);

        if (sheetElementTypes.includes(node.type)) {
            //Any nested sheet element should be lifted
            if (Node.parent(editor, path).type !== "SheetContent") {
                Transforms.liftNodes(editor, {at: path});
                return true;
            }
        }
    };

    // Only allow text inside SheetSource and SheetOutsideBiText
    editor.enforceTextOnlyInBoxedSheetElement = (node, path) => {
        // SheetSource, SheetComment, SheetOutsideText, SheetOutsideBiText, SheetMedia
        const sheetElementTypes = Object.values(sheet_item_els);

        if (["SheetSource", "SheetOutsideBiText"].includes(node.type)) {
            //anything pasted into a sheet source object or a sheet outsideBiText will be treated just as text content
            for (const [child, childPath] of Node.children(editor, path)) {
                if (sheetElementTypes.includes(child.type)) {
                    Transforms.unwrapNodes(editor, {at: childPath});
                    return true;
                }
            }
        }
    };

    editor.ensureEditableSpaceBeforeAndAfterBoxedElements = (node, path) => {
        if (["SheetSource", "SheetOutsideBiText"].includes(node.type)) {
            const nextPath = Path.next(path);
            if (Node.get(editor, nextPath).type !== "spacer" && Node.get(editor, Path.next(path)).type !== "SheetOutsideText") {
                console.log(nextPath);
                Transforms.insertNodes(editor, {type: 'spacer', children: [{text: ""}]}, {at: nextPath});
                return true;
            }
        }
    };

    editor.onlyTextAndRefsInBoxedElements = (node, path) => {
        if (node.type === "he" || node.type === "en") {
            //only allow TextRef & SourceContentText in he or en
            // if extra -- merge it with the previous element
            if (node.children && node.children.length > 2) {
                for (const [child, childPath] of Node.children(editor, path)) {
                    if (!["SourceContentText", "TextRef"].includes(child.type)) {
                        Transforms.mergeNodes(editor, {at: childPath});
                        return true;
                    }
                }
            }
        }
    };

    // for he's or en's in a SheetSource, make sure that SourceContentText exists
    editor.addPlaceholdersForEmptyText = (node, path) => {
        if (node.type === "he" || node.type === "en") {

            if (Node.parent(editor, path).type === "SheetSource") {
                if (node.children && node.children.length < 2) {
                    const insertPath = path.concat([1]);
                    Transforms.insertNodes(editor, {
                        type: "SourceContentText",
                        children: parseSheetItemHTML('...')
                    }, {at: insertPath});
                    return true;
                }
            }
        }
    };

return editor
};

const incrementNextSheetNode = (editor) => {
  Transforms.setNodes(editor, {nextNode: editor.children[0].nextNode + 1}, {at: [0]});
}

const addItemToSheet = (editor, fragment) => {
    incrementNextSheetNode(editor);
    Transforms.insertNodes(editor, fragment);
    Editor.normalize(editor, { force: true })
};



const checkAndFixDuplicateSheetNodeNumbers = (editor) => {
  let existingSheetNodes = []
  for (const [child, childPath] of Node.children(editor, [0,0])) {
    const sheetNode = child;
    if (existingSheetNodes.includes(sheetNode.node)) {
      Transforms.setNodes(editor, {node: editor.children[0].nextNode}, {at: childPath});
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
  addItemToSheet(editor, fragment);
  Transforms.move(editor);
}

const insertSource = (editor, ref) => {
    const path = editor.selection.anchor.path;

    Transforms.setNodes(editor, { loading: true }, {at: path});

    const nodeAbove = getNodeAbove(path, editor)
    const nodeBelow = getNodeBelow(path, editor)

    Sefaria.getText(ref, {stripItags: 1}).then(text => {
        const enText = Array.isArray(text.text) ? `<p>${text.text.flat(Infinity).join("</p><p>")}</p>` : text.text;
        const heText = Array.isArray(text.text) ? `<p>${text.he.flat(Infinity).join("</p><p>")}</p>` : text.he;
        let fragment = [{
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
        }];

        if (!(nodeBelow.node && (nodeBelow.node.type == "SheetOutsideText" || nodeBelow.node.type == "paragraph" ) )) {
          fragment.push({type: 'spacer', children: [{text: ""}]})
        }
        Transforms.setNodes(editor, { loading: false }, { at: path });
        addItemToSheet(editor, fragment);
        checkAndFixDuplicateSheetNodeNumbers(editor)
        if (nodeAbove.node && (nodeAbove.node.type == "SheetOutsideText" || nodeAbove.node.type == "paragraph" ) ) {
          Transforms.delete(editor, {at: path})
        }


        Transforms.move(editor, { unit: 'block', distance: 1 })
    });
};


const withTables = editor => {
  const { deleteBackward, deleteForward, insertBreak } = editor

  editor.deleteBackward = unit => {
    const { selection } = editor

    if (selection && Range.isCollapsed(selection)) {
      const [cell] = Editor.nodes(editor, {
        match: n =>
          !Editor.isEditor(n) &&
          SlateElement.isElement(n) &&
          n.type === 'table-cell',
      })

      if (cell) {
        const [, cellPath] = cell
        const start = Editor.start(editor, cellPath)

        if (Point.equals(selection.anchor, start)) {
          return
        }
      }
    }

    deleteBackward(unit)
  }

  editor.deleteForward = unit => {
    const { selection } = editor

    if (selection && Range.isCollapsed(selection)) {
      const [cell] = Editor.nodes(editor, {
        match: n =>
          !Editor.isEditor(n) &&
          SlateElement.isElement(n) &&
          n.type === 'table-cell',
      })

      if (cell) {
        const [, cellPath] = cell
        const end = Editor.end(editor, cellPath)

        if (Point.equals(selection.anchor, end)) {
          return
        }
      }
    }

    deleteForward(unit)
  }

  editor.insertBreak = () => {
    const { selection } = editor

    if (selection) {
      const [table] = Editor.nodes(editor, {
        match: n =>
          !Editor.isEditor(n) &&
          SlateElement.isElement(n) &&
          n.type === 'table',
      })

      if (table) {
        return
      }
    }

    insertBreak()
  }

  return editor
}

const Link = ({ attributes, children, element }) => {
  const editor = useSlate();
  const {selection} = editor;

  const focused = useFocused();
  const selected = useSelected();
  const [linkPopoverVisible, setLinkPopoverVisible] = useState(false);
  const [urlValue, setUrlValue] = useState(element.url);
  const [showLinkRemoveButton, setShowLinkRemoveButton] = useState(false);
  const [currentSlateRange, setCurrentSlateRange] = useState(editor.linkOverrideSelection)


  let showLinkHoverTimeout;
  let hideLinkHoverTimeout;

    const onHover = (e, url) => {
        clearTimeout(hideLinkHoverTimeout)
        if (!editor.selection || editor.linkOverrideSelection) {return}
        let range = document.createRange();
        range.selectNode(e.target);
        setCurrentSlateRange(ReactEditor.toSlateRange(editor, range, {exactMatch: false}))
        showLinkHoverTimeout = setTimeout(function () {
            Transforms.select(editor, currentSlateRange);
            setLinkPopoverVisible(true)
        }, 500, e);
    }
    const onBlur = (e, url) => {
        clearTimeout(showLinkHoverTimeout)
        hideLinkHoverTimeout = setTimeout(function () {
            setLinkPopoverVisible(false)
            setCurrentSlateRange(null)
        }, 500);
    }
    const onClick = (e, url) => {
        window.open(url, '_blank').focus();
    }

    const xClicked = () => {
        Transforms.select(editor, currentSlateRange);
        editor.removeLink();
        editor.showLinkOverride = false;
        editor.linkOverrideSelection = null;
        // Transforms.collapse(editor);
    }

    const closePopup = () => {
        editor.showLinkOverride = false;
        editor.linkOverrideSelection = null;
    }

    const fixUrl = (s) => {
        try {
            let url = new URL(s)
            return(url)
        }

        catch {
            return(`http://${s}`)
        }
    }

    const urlChange = (e) => {
        const newUrl = e.target.value;
        setUrlValue(newUrl)
        const [node, linkPath] = Editor.above(editor, {at: currentSlateRange, match: n => n.type ==="link"})
        Transforms.setNodes(editor, { url: fixUrl(newUrl) }, {at: linkPath});
    }

    const linkPopoverOpen = linkPopoverVisible || (editor.showLinkOverride && Path.isDescendant(editor.linkOverrideSelection.anchor.path, ReactEditor.findPath(editor, element)))

  return (
    <div
        {...attributes}
        className="element-link"
        onMouseEnter={(e) => onHover(e, element.url)}
        onMouseLeave={(e) => onBlur(e, element.url)}
    >
        <a
            href={element.url}
            onClick={(e) => onClick(e, element.url)}
            onMouseEnter={(e)=> {if (!linkPopoverOpen) {
                setShowLinkRemoveButton(true)
            }
            }}
        >
            {children}
        </a>

      {/* Show popup on hover and also force it open when a new link is created  */}
      {linkPopoverOpen ? (
        <div className="popup" contentEditable={false} onBlur={closePopup}>
          <input
              type="text"
              value={urlValue}
              placeholder="Enter link URL"
              className="sans-serif"
              onChange={(e) => urlChange(e)}
          />
            {showLinkRemoveButton ? <button onClick={() => xClicked()}>✕</button> : null}
        </div>
      ) : null }


    </div>

  )

 }


const withLinks = editor => {
    const { isInline } = editor

    editor.isInline = element => {
        return element.type === 'link' ? true : isInline(element)
    };

    editor.createLinkNode = (href, text) => ({
        type: "link",
        href,
        children: [{ text }]
    });

    editor.insertLink = (url) => {
        if (!url) return;
        const { selection } = editor;
        const link = editor.createLinkNode(url, "New Link");
        ReactEditor.focus(editor);
        if (!!selection) {
            const [parentNode, parentPath] = Editor.parent(
                editor,
                selection.focus?.path
            );
            // Remove the Link node if we're inserting a new link node inside of another
            // link.
            if (parentNode.type === "link") {
                editor.removeLink(editor);
            }
            if (editor.isVoid(parentNode)) {
                // Insert the new link after the void node
                Transforms.insertNodes(editor, createParagraphNode([link]), {
                    at: Path.next(parentPath),
                    select: true
                });
            } else if (Range.isCollapsed(selection)) {
                // Insert the new link in our last known location
                Transforms.insertNodes(editor, link, { select: true });
            } else {
                // Wrap the currently selected range of text into a Link
                Transforms.wrapNodes(editor, link, { split: true });
                Transforms.collapse(editor, { edge: "end" });
            }
        } else {
            return
        }
    };

    editor.removeLink = () => {
        Transforms.unwrapNodes(editor, {
            match: (n) =>
                !Editor.isEditor(n) && SlateElement.isElement(n) && n.type === "link"
        });
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

const toggleBlock = (editor, format) => {
  const isActive = isBlockActive(editor, format)
  const isList = LIST_TYPES.includes(format)

  Transforms.unwrapNodes(editor, {
    match: n =>
      LIST_TYPES.includes(
        !Editor.isEditor(n) && SlateElement.isElement(n) && n.type
      ),
    split: true,
  })
  const newProperties = {
    type: isActive ? 'paragraph' : isList ? 'list-item' : format,
  }
  Transforms.setNodes(editor, newProperties)

  if (!isActive && isList) {
    const block = { type: format, children: [] }
    Transforms.wrapNodes(editor, block)
  }
}

const isBlockActive = (editor, format) => {
  const [match] = Editor.nodes(editor, {
    match: n =>
      !Editor.isEditor(n) && SlateElement.isElement(n) && n.type === format,
  })

  return !!match
}


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
    if (leaf.superscript) {
        children = <sup>{children}</sup>
    }
    if (leaf.isRef) {
        children = <span className="inlineTextRef">{children}</span>
    }
    if (leaf.color) {
      children = <span style={{color: leaf.color}}>{children}</span>
    }
    if (leaf["background-color"]) {
      children = <span style={{backgroundColor: leaf["background-color"]}}>{children}</span>
    }
    if (leaf["text-align"]) {
      children = <span style={{textAlign: leaf["text-align"]}}>{children}</span>
    }

    return <span {...attributes}>{children}</span>
};

const HoverMenu = (opt) => {
    const buttons = (opt["buttons"])
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
            Editor.string(editor, selection) === '' ||
            isLinkActive(editor)
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
            {buttons == "basic" ? null : <>
                <AddLinkButton/>
                <BlockButton editor={editor} format="header" icon="header" />
                <BlockButton editor={editor} format="numbered-list" icon="list-ol" />
                <BlockButton editor={editor} format="bulleted-list" icon="list-ul" />
            </>
            }

        </div>,
        root
    )
};

const AddLinkButton = () => {
    const editor = useSlate();
    const classes = {fa: 1};
    classes["fa-link"] = 1

    return (
        <span className="hoverButton"
              onMouseDown={event => {
                  event.preventDefault();
                  wrapLink(editor, "")
                  editor.showLinkOverride = true;
                  editor.linkOverrideSelection = editor.selection;
                  // Timeout required b/c it takes a moment for react to rerender before focusing on the new input
                  setTimeout(() => {
                      document.querySelector(".popup input").focus()
                  }, 200);

              }}
        >
      <i className={classNames(classes)}/>
    </span>
    )
}

const FormatButton = ({format}) => {
    const editor = useSlate();
    const isActive = isFormatActive(editor, format);
    const iconName = "fa-" + format;
    const classes = {fa: 1, active: isActive};
    classes[iconName] = 1;

    return (
        <span className="hoverButton"
              onMouseDown={event => {
                  event.preventDefault();
                  toggleFormat(editor, format);
              }}
        >
      <i className={classNames(classes)}/>
    </span>
    )
};

const BlockButton = ({format, icon}) => {
    const editor = useSlate()
    const isActive = isBlockActive(editor, format);
    const iconName = "fa-" + icon;
    const classes = {fa: 1, active: isActive};
    classes[iconName] = 1;

    return (
        <span className="hoverButton"
              onMouseDown={event => {
                  event.preventDefault();
                  toggleBlock(editor, format);
              }}
        >
      <i className={classNames(classes)}/>
    </span>
    )
}


function saveSheetContent(doc, lastModified) {
    const sheetTitle = document.querySelector(".sheetContent .sheetMetaDataBox .title") ? document.querySelector(".sheetContent .sheetMetaDataBox .title").textContent : "Untitled"

    const sheetContent = doc.children.find(el => el.type == "SheetContent").children;

    const sources = sheetContent.map(item => {
        const sheetItem = item;
        switch (sheetItem.type) {
            case 'SheetSource':

                const enSerializedSourceText = (sheetItem.enText.reduce( (concatenatedSegments, currentSegment) => {
                  return concatenatedSegments + serialize(currentSegment)
                }, "" ) );

                const heSerializedSourceText = (sheetItem.heText.reduce( (concatenatedSegments, currentSegment) => {
                  return concatenatedSegments + serialize(currentSegment)
                }, "" ) );

                let source = {
                    "ref": sheetItem.ref,
                    "heRef": sheetItem.heRef,
                    "text": {
                        "en": enSerializedSourceText !== "" ? enSerializedSourceText : "...",
                        "he": heSerializedSourceText !== "" ? heSerializedSourceText : "...",
                    },
                    ...sheetItem.options && { options: sheetItem.options },
                    "node": sheetItem.node,
                };
                return (source);
            case 'SheetOutsideBiText':

                const enSerializedOutsideText = (sheetItem.enText.reduce( (concatenatedSegments, currentSegment) => {
                  return concatenatedSegments + serialize(currentSegment)
                }, "" ) );

                const heSerializedOutsideText = (sheetItem.heText.reduce( (concatenatedSegments, currentSegment) => {
                  return concatenatedSegments + serialize(currentSegment)
                }, "" ) );

                let outsideBiText = {
                    "outsideBiText": {
                        "en": enSerializedOutsideText !== "" ? enSerializedOutsideText : "...",
                        "he": heSerializedOutsideText !== "" ? heSerializedOutsideText : "...",
                    },
                    ...sheetItem.options && { options: sheetItem.options },
                    "node": sheetItem.node,

                };
                return outsideBiText;

            case 'SheetComment':
                return ({
                    "comment": serialize(sheetItem),
                    ...sheetItem.options && { options: sheetItem.options },
                    "node": sheetItem.node,
                });

            case 'SheetOutsideText':
               const outsideTextText = serialize(sheetItem)
               //Add space to empty outside texts to preseve line breaks from old sheets.
               return ({
                    "outsideText": (outsideTextText=="<p></p>" || outsideTextText=="<div></div>") ? "<p> </p>" : outsideTextText,
                    ...sheetItem.options && { options: sheetItem.options },
                    "node": sheetItem.node,
                });

            case 'SheetMedia':
                return({
                    "media": sheetItem.mediaUrl,
                    ...sheetItem.options && { options: sheetItem.options },
                    "node": sheetItem.node,
                });

            case 'header':
                const headerContent = serialize(sheetItem)
                return({
                    "outsideText": `<h1>${headerContent}</h1>`,
                    ...sheetItem.options && { options: sheetItem.options },
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
        title: sheetTitle === "" ? "Untitled" : sheetTitle,
        sources: sources.filter(x => !!x),
        nextNode: doc.nextNode,
    };
    // title: sheetTitle == "" ? "Untitled" : sheetTitle,

    return JSON.stringify(sheet);

}



const SefariaEditor = (props) => {
    const editorContainer = useRef();
    const sheet = props.data;
    const initValue = transformSheetJsonToSlate(sheet);
    const renderElement = useCallback(props => <Element {...props} />, []);
    const [value, setValue] = useState(initValue);
    const [currentDocument, setCurrentDocument] = useState(initValue);
    const [unsavedChanges, setUnsavedChanges] = useState(false);
    const [lastModified, setlastModified] = useState(props.data.dateModified);

    useEffect(
        () => {
            setUnsavedChanges(true);
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
        [currentDocument[0].children[0]] // Only re-call effect if value or delay changes
    );

    useEffect( /* normalize on load */
        () => {

            Editor.normalize(editor, { force: true })
        }, []
    )


  useEffect(() => {
    if(!props.hasSidebar) {
      editor.highlightedNode = null;
    }
  }, [props.hasSidebar]);


  useEffect(() => {
      let scrollTimeOutId = null;
      const onScrollListener = () => {
          clearTimeout(scrollTimeOutId);
          scrollTimeOutId = setTimeout(
              () => {
                  if(props.hasSidebar) {
                      ReactEditor.deselect(editor);
                      onEditorSidebarToggleClick()
                  }
              }, 200
          );
      };

      let clickTimeOutId = null;
      const onClickListener = (e) => {
        clearTimeout(clickTimeOutId);
        clickTimeOutId = setTimeout(
          () => {
            if(props.hasSidebar) {
            let sheetElementTypes = Object.values(sheet_item_els);
              for(const node of Node.ancestors(editor, editor.selection.focus.path)) {
                  if (sheetElementTypes.includes(node[0].type)) {
                    console.log(editor)
                      if (node[0].node != editor.highlightedNode) {
                        updateSidebar(node[0].node, node[0].ref)
                        if (node[0].type != "SheetSource") {
                          Transforms.select(editor, editor.blurSelection);
                          ReactEditor.focus(editor);
                        }
                      }
                      break;
                  }
              }
            }
          }, 20);
      };



     editorContainer.current.parentNode.parentNode.addEventListener("scroll", onScrollListener);
     editorContainer.current.parentNode.parentNode.addEventListener("click", onClickListener);


      return () => {
          editorContainer.current.parentNode.parentNode.removeEventListener("scroll", onScrollListener);
          editorContainer.current.parentNode.parentNode.removeEventListener("click", onClickListener);
      }
    }, [props.highlightedNode, props.hasSidebar]
  );


    function saveDocument(doc) {
        const json = saveSheetContent(doc[0], lastModified);
        console.log('saving...');

        $.post("/api/sheets/", {"json": json}, res => {
            setlastModified(res.dateModified);
            // console.log("saved at: "+ res.dateModified);
            setUnsavedChanges(false);

            const updatedSheet = {...Sefaria.sheets._loadSheetByID[doc[0].id], ...res};
            Sefaria.sheets._loadSheetByID[doc[0].id] = updatedSheet
        });
    }

    function onChange(value) {
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

    const ensureInView = e => {
          /*
            Slate doesn't always scroll to content beyond the viewport -- this should fix that.
           */
          if (editor.selection == null) return

          try {
            /*
              Need a try/catch because sometimes you get an error like:
              Cannot resolve a DOM node from Slate node: {"type":"p","children":[{"text":"","by":-1,"at":-1}]}
             */
            const domPoint = ReactEditor.toDOMPoint(
              editor,
              editor.selection.focus
            )
            const node = domPoint[0]
            if (node == null) return

            const element = node.parentElement
            if (element == null) return
            if (whereIsElementInViewport(element) == "in viewport") return
            element.scrollIntoView({ behavior: "auto", block: "end" })
          } catch (e) {
            //Do nothing if there is an error.
          }
    };

    const onCutorCopy = event => {
        const nodeAbove = Editor.above(editor, { match: n => Editor.isBlock(editor, n) })

        if (nodeAbove[0].type == "SheetSource") {
            editor.cuttingSource = true;
            //can't select an empty void -- so we select before and after as well
            Transforms.move(editor, { distance: 1, unit: 'character', reverse: true, edge: 'anchor' })
            Transforms.move(editor, { distance: 1, unit: 'character', edge: 'focus' })
        }

    };

    const onBlur = event => {
      editor.blurSelection = editor.selection
    };

    const onKeyDown = event => {
        ensureInView(event);

        for (const hotkey in HOTKEYS) {
          if (isHotkey(hotkey, event)) {
            event.preventDefault();
            const format = HOTKEYS[hotkey];
            toggleFormat(editor, format)
          }
        }

        // Add or remove ref highlighting
        if (event.key === " " || Node.get(editor, editor.selection.focus.path).isRef) {
            getRefInText(editor, false)
        }
    };

    const whereIsElementInViewport = (element) => {
        const elementbbox = element.getBoundingClientRect();
        const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0)
        if (elementbbox.top >= 200 && elementbbox.bottom < vh) {
            return "in viewport"
        }
        if (elementbbox.bottom >= vh/2 && element) {
            return "past half"
        }
    };

    const getHighlightedByScrollPos = () => {
        let segmentToHighlight = null

        const segments = editorContainer.current.querySelectorAll(".sheetItem");

        for (let segment of segments) {
            const elementLoc = whereIsElementInViewport(segment);
            if (elementLoc === "in viewport" || elementLoc === "past half") {
                segmentToHighlight = segment;
                break;
            }
        }

        return segmentToHighlight

    };

    const updateSidebar = (sheetNode, sheetRef) => {
      let source = {
          'node': sheetNode,
      };
      if (!!sheetRef) {
          source["ref"] = sheetRef
      }
      editor.highlightedNode = sheetNode
      props.sheetSourceClick(source)

    };

    const onEditorSidebarToggleClick = event => {
        const segmentToHighlight = getHighlightedByScrollPos()
        if (!segmentToHighlight) {return}
        const sheetNode = segmentToHighlight.getAttribute("data-sheet-node")
        const sheetRef = segmentToHighlight.getAttribute("data-sefaria-ref")
        updateSidebar(sheetNode, sheetRef)
    };


    const editor = useMemo(
        () => withTables(withSefariaSheet(withLinks(withHistory(withReact(createEditor()))))),
        []
    );


    return (
        <div ref={editorContainer}>
        {
          /* debugger */

          // <div style={{position: 'fixed', left: 0, top: 0, width: 300, height: '100%', backgroundColor: '#ddd', fontSize: 12, zIndex: 9999, whiteSpace: 'pre', overflow: "scroll"}}>
          // {JSON.stringify(editor.children[0,0], null, 4)}
          // </div>

        }

            <button className="editorSidebarToggle" onClick={(e)=>onEditorSidebarToggleClick(e) } aria-label="Click to open the sidebar" />

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
              <a href={sheet.ownerProfileUrl}>
                <InterfaceText>{sheet.ownerName}</InterfaceText>
              </a>
            </SheetAuthorStatement>
            <CollectionStatement
                name={sheet.collectionName}
                slug={sheet.displayedCollection}
                image={sheet.collectionImage}
            />
        </SheetMetaDataBox>

            <Slate editor={editor} value={value} onChange={(value) => onChange(value)}>
                <HoverMenu buttons="all"/>
                <Editable
                  renderLeaf={props => <Leaf {...props} />}
                  renderElement={renderElement}
                  spellCheck
                  onKeyDown={onKeyDown}
                  onCut={onCutorCopy}
                  onCopy={onCutorCopy}
                  onBlur={onBlur}
                  onDOMBeforeInput={beforeInput}
                />
            </Slate>
        </div>
    )
};

export default SefariaEditor;
