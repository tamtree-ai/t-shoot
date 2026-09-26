/**
 * The shipped StickStage registry as one object, the shape `checkDraft` and the renderer take.
 * Client-safe: `stickstage/data` is plain data plus the pure core.
 */
import { catalog, library, reactions, safeArea, sets, sfxLibrary } from "stickstage/data";

export const stickRegistry = { lib: library, sets, sfx: sfxLibrary, reactions, safeArea };
export { catalog as stickCatalog };
