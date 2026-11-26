// The modal's icons: the same 24×24 stroke paths live's search modal draws (feather set).
const PATHS = {
  search: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.35-4.35'],
  'book-open': ['M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2V3ZM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7V3Z'],
  code: ['m16 18 6-6-6-6M8 6l-6 6 6 6'],
  'custom-pages': [
    'M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-7-7Z',
    'M13 2v7h7M12 11.333V12M12 18v.667M9.407 12.407l.473.473M14.12 17.12l.473.473M8.333 15H9M15 15h.667M9.407 17.593l.473-.473M14.12 12.88l.473-.473',
  ],
  'arrow-left': ['M19 12H5M12 19l-7-7 7-7'],
  'arrow-right': ['M5 12h14M12 5l7 7-7 7'],
  x: ['M18 6 6 18M6 6l12 12'],
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" data-icon={name}>
      {PATHS[name].map((d) => (
        <path key={d} d={d} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  );
}
