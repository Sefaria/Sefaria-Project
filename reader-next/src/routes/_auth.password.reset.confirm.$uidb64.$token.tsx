import { createFileRoute } from "@tanstack/react-router";
import { authHead } from "~/features/auth/titles";

/** /password/reset/confirm/<uidb64>/<token>/ (Django's path shape) — rendered by the _auth layout (AuthRoute). See docs/DEPLOYMENT.md › Sign-in. */
export const Route = createFileRoute("/_auth/password/reset/confirm/$uidb64/$token")({ head: authHead("reset"), component: () => null });
