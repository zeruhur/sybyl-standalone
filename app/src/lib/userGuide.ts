// Single source of truth is docs/USER_GUIDE.md (linked from the repo README) — this bundles it
// into the app at build time via Vite's `?raw` import rather than keeping a second copy in sync.
import userGuideRaw from "../../../docs/USER_GUIDE.md?raw";

export default userGuideRaw;
