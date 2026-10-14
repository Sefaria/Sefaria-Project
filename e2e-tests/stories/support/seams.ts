// BINDING LAYER. Errors that mark an honest red: the story needs something the
// test harness can't reach yet. See ../README.md and ../STATUS.md.

/** Thrown when a story needs a test seam (account, config, hook) that doesn't exist yet. */
export class SeamMissing extends Error {}
