# CODEX AGENT RULES — via-decide/decide.engine-tools

## REPO IDENTITY
- Stack: Vanilla JS, HTML, CSS, Supabase CDN.
- No build step. No npm. No bundler. No React.
- Everything runs directly in the browser.
- GitHub Pages host: https://via-decide.github.io/decide.engine-tools/

## THE PRIME DIRECTIVE
- Read every file you are about to change.
- Understand what it does before touching it.
- If unsure what a line does, do not change it.
- Surgical edits only. Never rewrite whole files.

## FILES YOU MUST NEVER MODIFY
- tools/games/skillhex-mission-control/js/app.js
- tools/games/hex-wars/index.html (QUESTIONS array)
- shared/shared.css
- _redirects
- tools-manifest.json (only add, never delete)
- missions.json (skillhex)

## FUNCTION BODIES — NEVER TOUCH
- hex-wars: calcPoints(), showResult(), restart(), loadQuestion(), updateStats(), haptic()
- skillhex: handleDecision(), advanceMission(), calculateScore(), renderCycle(), initApp()
- snake-game: step(), draw(), reset(), spawnFood()
- wings-quiz: selectAnswer(), showQuestion(), startTimer(), broadcast(), createRoom(), joinRoom()
- layer1-swipe: commitSwipe(), finishSession(), buildCardElement(), startSessionIfEligible(), hydrateState(), syncState()
- growth-engine: anything inside requestAnimationFrame animation loops

## SCRIPT TAG LOADING ORDER — CRITICAL
1. Three.js CDN (if used) — first
2. Other CDN scripts
3. shared/vd-nav-fix.js
4. shared/vd-wallet.js (if needed)
5. shared/tool-storage.js (if needed)
6. Other shared/*.js files
7. Inline scripts or type="module" scripts — last

## ES MODULES vs PLAIN SCRIPTS
- SkillHex uses ES modules; most others use plain scripts.
- Shared scripts remain plain scripts, not modules.
- Guard window globals in modules with typeof checks.

## SYNTAX RULES
1. No duplicate const declarations in same scope.
2. No orphaned object literals.
3. SQL function delimiters use $$.
4. No !important on transform/opacity for game card elements.
5. Preserve IIFE wrappers.

## SHARED ECONOMY — SAFE WIRING PATTERN
- Add shared script in proper order.
- Add a new award function outside existing functions.
- Call from one safe location (not render loops/timers/RAF).
- Always guard with typeof window.VDWallet.

Wallet fields:
- focusDrops
- lumina
- hexTokens
- missionXP
- snakeCoins
- quizStars

## SUPABASE RULES
- Project URL: https://bfocxgtlemhxfwfuhlxn.supabase.co
- Anon key is provided by developer as window.ECO_SUPABASE_ANON_KEY
- Never hardcode anon key
- Never use process.env in browser HTML files
- Use snake_case column names
- Use .single() when expecting one row
- Handle error in Supabase responses
- Verify SQL function exists before .rpc()

## GITHUB PAGES PATH RULES
- Base path is /decide.engine-tools/
- Prefer relative links (./ or ../)
- Avoid absolute /tools/... links

## BEFORE EVERY COMMIT — CHECKLIST
1. grep -n "const canonicalRoute" router.js
2. grep -n "const navLinks\|const sections" router.js
3. node --check router.js
4. python3 -c "import json; json.load(open('tools-manifest.json'))"
5. grep -n "bar.href" shared/vd-nav-fix.js
6. grep -n "example.supabase.co\|replace-with-anon-key" tools/eco-engine-test/index.html
7. grep -n "!important" tools/games/*/index.html | grep -i "transform\|opacity"
8. verify script tag balance on modified HTML files

## OUTPUT FORMAT
| File | Change | Lines affected | Verified |
|------|--------|----------------|----------|

Include skipped files + failed checks.

## AI EXECUTION PROTOCOL
READ → ANALYZE → PLAN → CONFIRM → MODIFY → VERIFY

## MODIFICATION LIMITS
- Max lines modified per file: 20
- Max files changed per task: 5
- Max new functions added: 3

## PROHIBITED ACTIONS
- No large rewrites
- No file renames/deletes/moves without instruction
- No architecture changes
- No frameworks/dependency managers

## BROWSER-ONLY ASSUMPTION
- Never introduce process.env, require(), node modules, bundlers.
- Must run in modern browsers on GitHub Pages with no build step.
