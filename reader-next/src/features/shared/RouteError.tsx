import { useRouter } from "@tanstack/react-router";
import { Button } from "~/ui/Button/Button";
import { ErrorState } from "~/ui/Feedback/Feedback";
import { InterfaceText } from "~/ui/InterfaceText/InterfaceText";

/**
 * What a page shows when it fails: the old reader's message and the error text, plus a way to try again. A failing panel
 * never leaves a blank screen.
 *
 * @feature SHL-035 Panel error state
 */
export function RouteError({ error }: { error: unknown }) {
  const router = useRouter();
  const message = error instanceof Error ? error.message : String(error);
  return (
    <ErrorState
      title={<InterfaceText en="Something went wrong!" he="ארעה תקלה במערכת." />}
      action={<Button variant="secondary" onClick={() => void router.invalidate()}><InterfaceText en="Try again" he="נסו שוב" /></Button>}
    >
      <InterfaceText en="Please use the back button or the menus above to get back on track." he="אנא חזרו לתפריט הראשי או אחורנית על ידי שימוש בכפתורי התפריט או החזור." />
      <br />
      <strong><InterfaceText en="Error Message: " he="שגיאה: " /></strong>
      <span data-testid="error-message">{message}</span>
    </ErrorState>
  );
}
