// What node views need from the editor app (the upload endpoint), without importing the app.
import { createContext, useContext } from 'react';
import type { EditorUploadResponse } from '../../contracts';

export interface EditorServices {
  upload(file: File): Promise<EditorUploadResponse>;
}

export const EditorServicesContext = createContext<EditorServices>({
  upload: () => Promise.reject(new Error('Uploads are not available here.')),
});

export function useEditorServices(): EditorServices {
  return useContext(EditorServicesContext);
}
