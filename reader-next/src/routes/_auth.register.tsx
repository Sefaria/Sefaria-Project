import { createFileRoute } from "@tanstack/react-router";
import { authHead } from "~/features/auth/titles";

/** /register — rendered by the _auth layout (AuthRoute). */
export const Route = createFileRoute("/_auth/register")({ head: authHead("register"), component: () => null });
