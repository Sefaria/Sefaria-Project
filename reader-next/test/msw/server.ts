import { setupServer } from "msw/node";
import { fixtureHandlers } from "./handlers";

export const server = setupServer(...fixtureHandlers);
