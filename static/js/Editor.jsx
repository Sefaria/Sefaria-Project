import React, { useState } from 'react';


import { Editor } from 'slate-react'
import { Value } from 'slate'
import Plain from 'slate-plain-serializer'
import Html from 'slate-html-serializer'



function SheetItem(props) {
  return (
      <div className="sheetItem">{props.children}</div>
  )
}

const BLOCK_TAGS = {
  blockquote: 'quote',
  p: 'paragraph',
  pre: 'code',
}

// Add a dictionary of mark tags.
const MARK_TAGS = {
  em: 'italic',
  strong: 'bold',
  u: 'underline',
}

const rules = [
  {
    deserialize(el, next) {
      const type = BLOCK_TAGS[el.tagName.toLowerCase()]
      if (type) {
        return {
          object: 'block',
          type: type,
          data: {
            className: el.getAttribute('class'),
          },
          nodes: next(el.childNodes),
        }
      }
    },
    serialize(obj, children) {
      if (obj.object == 'block') {
        switch (obj.type) {
          case 'code':
            return (
              <pre>
                <code>{children}</code>
              </pre>
            )
          case 'paragraph':
            return <p className={obj.data.get('className')}>{children}</p>
          case 'quote':
            return <blockquote>{children}</blockquote>
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
        }
      }
    },
  },
]
const html = new Html({ rules })




function SefariaEditor(props) {
    console.log(props.data)
    const [slateValue, setSlateValue] = useState(html.deserialize(props.data));

    function onKeyDown(event, editor, next) {
        console.log(event.key)
        return next()
    }

  function renderBlock(props, editor, next) {
        return <SheetItem {...props} />
      //return next()
  }



    return (
        <Editor
            value={slateValue}
            onChange={({value}) => setSlateValue(value)}
            onKeyDown={(event, editor, next) => onKeyDown(event, editor, next)}
            renderBlock={(props, editor, next) => renderBlock(props, editor, next)}
        />
    )


}




module.exports = SefariaEditor;
