import { createFileRoute } from "@tanstack/react-router";
import { authHead } from "~/features/auth/titles";

/** /login — rendered by the _auth layout (AuthRoute). */
export const Route = createFileRoute("/_auth/login")({ head: authHead("login"), component: () => null });
