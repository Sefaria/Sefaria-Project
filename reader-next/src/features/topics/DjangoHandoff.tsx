import { useEffect } from "react";
import { documentLoadUrl, shouldHandOffToDjango } from "~/lib/routing/django-handoff";
import { NotFoundPage } from "~/features/routing/NotFoundPage";

/**
 * The topics routes' not-found page (TOP-036). A topic, category or editor this client does not render is a 404 that the server
 * hands to Django — on a full load. Reached by an in-app navigation, the address is loaded again from the server so Django gets it.
 * The server's own 404 is final (Django has no page there either), so it is the reader's shared "Page Not Found".
 * @feature TOP-036 Topic pages not rendered here go to Django
 * @feature RTE-040 404 and error pages
 */
export function DjangoHandoff() {
  useEffect(() => {
    if (shouldHandOffToDjango(documentLoadUrl(), window.location.href)) window.location.reload();
  }, []);
  return (
    <div data-django-handoff="">
      <NotFoundPage />
    </div>
  );
}
