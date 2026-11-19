import { nativeLanguageName } from '../../lib/languages';

/** A language's English name with its own-script name beside it, e.g. "Hebrew עברית". */
export function LanguageName({ name }: { name: string }) {
  const native = nativeLanguageName(name);
  if (!native) return <>{name}</>;
  return (
    <>
      {name}{' '}
      <span lang={native.code} dir="auto">
        {native.text}
      </span>
    </>
  );
}
