import { copyFileSync, writeFileSync } from 'node:fs';

// Disable Jekyll processing: every file in docs is an ordinary static game asset.
writeFileSync(new URL('../docs/.nojekyll', import.meta.url), '');
copyFileSync(new URL('../THIRD_PARTY_NOTICES.txt', import.meta.url), new URL('../docs/THIRD_PARTY_NOTICES.txt', import.meta.url));
copyFileSync(new URL('../LICENSE', import.meta.url), new URL('../docs/LICENSE', import.meta.url));
