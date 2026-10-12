# Context Handoffs

A handoff is a short, structured briefing that lets another AI, account or device pick up a
conversation where it stopped. It has six sections: Goal, Where we are, Decisions made (and why),
Next steps, Key files and snippets, and Preferences and constraints.

The page is `/handoffs`, in the free part of the app.

## Two ways to make one

| | Ask your AI to write it | Upload or paste a chat |
|---|---|---|
| How | Copy our prompt into the chat you're leaving, paste the AI's answer back | Pick an export file or paste a chat; VibeAssist condenses it |
| AI on our side | None | The `handoffs` function, with the AI chosen under Engine AI, else VibeAssist's Claude |
| Daily limit | None | 5 a day on VibeAssist's AI (they also count toward the 30-request pool), 50 on the user's own key |
| Works with | Every AI tool | The formats below |

## Chat formats (read in the browser, `src/lib/transcripts.js`)

- **Confirmed layouts:**
  - ChatGPT `conversations.json`, the export zip, or `chat.html`. Only the branch the user kept is read; custom instructions and hidden thinking are left out.
  - Claude.ai `conversations.json`.
  - Claude Code session `.jsonl`, along the active branch. Sidechains, `isMeta` lines, injected `<system-reminder>` blocks and `attachment` lines are dropped (attachment lines contain the account email).
  - Copilot chat from VS Code ("Chat: Export Chat…").
- **Best effort:** these layouts aren't documented. They're read from what's known, with the generic reader as a fallback. Fixtures should be updated from a real export when one is available.
  - DeepSeek (`mapping` with `fragments`)
  - Gemini (Google Takeout `MyActivity.json`, grouped into chats by 30-minute gaps; Gemini CLI saved chats)
  - Grok
  - Meta AI
- **Anything else:** the generic reader finds lists of messages with a role and text. Then it tries HTML, then speaker labels (`User:`, `You said:`, `**Assistant**`, SpecStory's `_**User**_`). If none of those work, the whole text is kept as one note.

Limits: files up to 100 MB, zips up to 300 MB. Zips are opened in the browser, and only `.json`, `.jsonl`, `.html`, `.md` and `.txt` entries are unpacked.

## Privacy and safety

- **Chats are never stored:**
  - The browser trims the chat to about 120,000 characters, keeping the opening and the newest messages.
  - The browser removes keys and passwords (`_shared/handoff/redact.js`).
  - The browser sends it only when the user presses the button.
  - The function cleans the chat again, sends it to the AI, saves only the handoff (also cleaned) and logs nothing of the chat.
- **Prompt injection:** the chat goes to the AI inside a `<transcript>` block marked as data, and the chat can't close that block itself. "Copy for another AI" wraps the handoff in `<handoff>` as background, not instructions. The shared page also tells readers that.
- **Rendering:** handoffs are rendered as text only, never as HTML.
- **Share links (Premium):**
  - Each link is 32 random bytes, shown once; only its sha256 is stored.
  - A link lasts 1, 7 or 30 days and can be revoked; a handoff can have up to 10 active links.
  - The page is `/handoff#<token>`. The token is after `#`, so it never reaches server logs or Referer headers.
- **`get_shared_handoff`:** callable without signing in, on purpose. The security advisor flags it like `ingest_metrics`. It only answers for a valid, unexpired, unrevoked token, and never returns who shared the handoff.

## Plans

- **Free:** 3 saved handoffs, enforced by the insert policy and by the function.
- **Premium:** up to 500, plus share links and the user's own AI key (chosen under Anti-Fragile Engine → Engine AI).

## Deploy

1. Apply `supabase/migrations/20261013090000_context_handoffs.sql` (only `public`).
2. Deploy `handoffs` with JWT checks on.
3. Redeploy `engine` (JWT on) and `engine-ingest` (JWT off): `_shared/engineAi.ts` now exports `resolveAi`.
4. Deploy the website.
