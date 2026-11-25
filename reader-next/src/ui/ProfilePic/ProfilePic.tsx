import { useState } from "react";
import { initials } from "~/lib/auth/session";
import styles from "./ProfilePic.module.css";

/**
 * A reader's round picture, or their initials on grey when there is none (or it is a gravatar, which may not exist, or fails to
 * load) — as the old ProfilePic did. Decorative next to the name; `alt` is the old "User Profile Picture".
 *
 * @feature GUI-010 Profile / account dropdown
 */
export function ProfilePic({ name, url, size = 24, alt = "User Profile Picture" }: { name: string; url?: string; size?: number; alt?: string }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // a gravatar may not exist: start with the initials and switch once it has loaded
  const gravatar = !!url && url.startsWith("https://www.gravatar");
  const showImage = !!url && !failed && (!gravatar || loaded);
  return (
    <>
      {url && !failed ? (
        <img className={styles.img} src={url} alt={alt} width={size} height={size} style={showImage ? undefined : { display: "none" }} onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />
      ) : null}
      {showImage ? null : (
        <span className={styles.initials} style={{ width: size, height: size, fontSize: size / 2 }} aria-hidden="true">
          {initials(name)}
        </span>
      )}
    </>
  );
}
