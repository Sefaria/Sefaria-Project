import React, {useMemo, useState, useEffect} from 'react';
import { createEditor } from 'slate'
import { Slate, Editable, withReact } from 'slate-react'

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

const initialValue = [
  {
    children: [
      {
        text: '',
        marks: [],
      },
    ],
  },
]

const SefariaEditor = () => {

  const editor = useMemo(() => withReact(createEditor()), [])

  return (
    // Add the editable component inside the context.
    <Slate editor={editor} defaultValue={initialValue}>
      <Editable placeholder="Enter some plain text..." />
    </Slate>
  )
}

export default SefariaEditor;
