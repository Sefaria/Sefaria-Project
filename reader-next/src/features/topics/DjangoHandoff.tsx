import { useEffect } from "react";
import { documentLoadUrl, shouldHandOffToDjango } from "~/lib/routing/django-handoff";
import { InterfaceText } from "~/ui/InterfaceText/InterfaceText";

/**
 * The topics routes' not-found page (TOP-036). A topic, category or editor this client does not render is a 404 that the server
 * hands to Django — on a full load. Reached by an in-app navigation, the address is loaded again from the server so Django gets it;
 * the server's own 404 stays (a plain message, as Django's 404 page would be in local development).
 * @feature TOP-036 Topic pages not rendered here go to Django
 */
export function DjangoHandoff() {
  useEffect(() => {
    if (shouldHandOffToDjango(documentLoadUrl(), window.location.href)) window.location.reload();
  }, []);
  return (
    <div data-django-handoff="" style={{ padding: "40px 25px" }}>
      <InterfaceText en="Page not found." he="הדף לא נמצא." />
    </div>
  );
}
