# Delivery architecture — ₹4,999 audit and ₹1,717 APK

Two products, two completely different delivery problems. One is a service with
a human in the loop; the other is a 17 MB binary that must not leak.

Written 2026-08-05, after finding that four of nine delivery links were dead
404s and that an APK sits on a public URL.

---

## Part 1 — ₹4,999 Architecture Audit (`arch_audit`)

A service. Nothing is "downloaded"; the deliverable is your time and a written
diagnosis. The architecture is therefore about **intake quality and a promise
you can keep**, not file hosting.

### The promise you are making

`hanuman.solutions` says **"Get diagnosis in 12h."** That is the product. Every
design decision below exists to make 12 hours achievable without you being
awake for all of it.

### Flow

```
hanuman.solutions
   └─ "Book an Architecture Audit — ₹4,999"
        └─ aporaksha.com/passport/checkout?product=arch_audit
             ├─ readiness gates (DB, SMTP, deliverable, geo)
             ├─ Razorpay order → payment
             └─ webhook → passport + invoice + delivery email
                  └─ email CTA: "Submit your system spec" → /intake
                       └─ intake form  ← THE CRITICAL STEP
                            └─ 12h clock starts
```

### The one thing that will break this

**Payment and intake are separated by an email.** The customer pays, gets an
email, and then has to click through and fill a form. Every hour they delay is
an hour of your 12 eaten by someone else's inbox.

Mitigations, in order of value:

1. **Redirect to `/intake` immediately on payment success**, with the order id
   prefilled. The email becomes a backup, not the path.
2. **Start the 12h clock at intake submission, not at payment.** Say so on the
   page. Otherwise you are liable for time you never had.
3. **Make intake refuse an empty submission.** A spec with no repo URL and no
   logs is not a spec; it costs you a round trip you have not budgeted for.

### What intake must capture

Minimum for a diagnosis to be possible at all:

| Field | Why |
|---|---|
| System URL or repo | without it there is nothing to look at |
| What is broken, in their words | tells you what they think the problem is |
| What they already tried | stops you repeating it |
| Error output / logs | the single highest-signal field |
| When it started | separates "always been broken" from "regression" |
| Urgency + timezone | so 12h means 12h *for them* |

### Delivery back

A written diagnosis. Not a call. Reasons: it is asynchronous, it is a
referenceable artefact, and it is the thing that becomes a case study later.

Structure that matches what actually gets found:

1. **What is broken** — the symptom they can verify themselves
2. **Why** — the mechanism, in plain language
3. **What it is costing** — downtime, silent data loss, revenue
4. **Fix** — ordered, smallest blast radius first
5. **What else this implies** — the things they did not ask about

### How this is actually delivered — `daxini-bca-learning`

The 12-hour promise is only realistic because the reference material already
exists. `via-decide/daxini-bca-learning` is not a course repo; it is the
**delivery library**.

54 domain modules across five categories — simple backend, multi-user,
real-time, AI/ML, complex databases — covering gym management, hospital,
hotel booking, event management, task management, project management, time
tracking, expense tracker, inventory, student information, clinic appointments,
library management, and more.

**49 of them carry the same seven files:**

| File | What it does in a refinement |
|---|---|
| `ARCHITECTURE.md` | the reference shape to compare theirs against |
| `COMMON_MISTAKES.md` | **the review checklist** — the highest-value file in the repo |
| `API_DESIGN.md` | what their endpoints should look like |
| `DATABASE.sql` | the schema their data should roughly match |
| `DEBUGGING_GUIDE.md` | maps directly onto the written diagnosis |
| `LEARNING_PATH.md` / `RESOURCES.md` | what to hand the client afterwards |
| `STARTER_TEMPLATE/` | working code, if the fix is a rewrite |

So delivery is **assembly, not invention**:

```
intake says "booking system"
  └─ pull projects/02-multi-user/03-hotel-booking
       ├─ compare their build against ARCHITECTURE.md
       ├─ walk COMMON_MISTAKES.md as the review checklist
       ├─ check their schema against DATABASE.sql
       └─ write the diagnosis using DEBUGGING_GUIDE.md's structure
```

That is what makes two a week sustainable alongside an M.Sc. Without it, every
refinement is a fresh investigation and the 12-hour promise breaks on the third
client.

**Gap worth closing:** 54 modules, 49 with the full seven-file set. The five
incomplete ones will be the ones a client asks about. Also, `04-ai-ml` has only
2 modules and `07-complex-databases` only 2 — thin coverage in the two areas
most likely to walk in the door in 2026.

### Capacity, honestly

One audit is a few hours of real attention. Two a week is comfortable alongside
an M.Sc.; five is not. When intake volume exceeds that, raise the price rather
than the queue — a 12h promise you miss is worse than a ₹9,999 price nobody
complains about.

---

## Part 2 — ₹1,717 GN8R automation APK (`zayvora_os`)

### What it actually is

Not "an Android app for founders." It is **packaged, proven automation for
people who already run their own infrastructure** — a Mac Mini, a home server,
a always-on box of some kind — and want workflows that are known to work rather
than ones they have to discover.

Two things define the buyer, and both matter for how it is sold:

1. **They already have the setup.** They are not buying capability, they are
   buying the workarounds. The value is that someone else already hit the edge
   cases and the recipes survive contact with a real machine.
2. **They do not want a Telegram dependency.** Most self-hosted automation
   assumes a Telegram bot as the control plane. That means a third-party account,
   a bot token, and an outbound channel to a service you do not control. This
   product deliberately does not require one.

That second point is the sharpest differentiator and should be said plainly on
the page, because the audience has usually already been burned by it. Worth
noting this estate is itself evidence: Telegram integration code exists across
several repos here and **no Telegram bot is running** — the automation works
without it.

### Positioning, in the buyer's words

> You already have the box. You do not want another bot token, another
> third-party account, or another thing that stops working when someone else's
> API changes. This is the automation, already debugged, running locally.

### The delivery constraint

Distribution is still a 17 MB binary, and that has a hard technical limit which
dictates the rest of this section.

### The constraint: you cannot email an APK

**Gmail blocks `.apk` attachments on send and on receive.** So does Outlook.
This is not configurable. Attachment delivery is not an option, and any design
that assumes it will fail silently at the worst moment.

### The pattern to avoid

`daxini.xyz/alchemist.apk` is publicly downloadable — 17.2 MB, no auth. That is
a *different product* and may well be intentional. It is noted here only as the
shape to avoid for a paid binary: a guessable filename on a public host is free
to anyone who guesses it.

So the two obvious options are both wrong:

| Option | Why it fails |
|---|---|
| Email attachment | blocked by every major provider |
| Public URL in the email | one forward and it is public |

### The design: opaque token, server-resolved

You already built this primitive — the `cards/` token registry. Same shape:

```
purchase
  └─ mint a 128-bit opaque token, bind it to the order + email
       └─ email contains  /download/{token}   — no filename, no path
            └─ server checks: token valid? not expired? not over-used?
                 └─ stream the APK, log the download
```

**Why this works where a URL does not**: the token names a *route*, not a file.
The server decides at request time whether that route still means anything.
Forward the link and you forward something the server can switch off.

### Rules that matter

| Rule | Value | Why |
|---|---|---|
| Expiry | 7 days | long enough for a real person, short enough that a leaked link dies |
| Download cap | 3 | phone, laptop, one retry. Above that is sharing |
| Revocable | yes | refunds, chargebacks, abuse |
| Log every download | yes | 30 downloads on one token is your answer about piracy |
| Re-issue | self-serve from the passport | otherwise every expiry is a support ticket |

Storage: Vercel Blob **private** (`access: 'private'`), read back server-side
and streamed. Never a public bucket.

### What this does not solve

It stops casual leaking, not determined piracy. Someone who buys it can put the
APK anywhere. That is true of every downloadable product and is not worth
engineering against — the token protects the *link*, and the link is what gets
forwarded by accident.

If the APK genuinely must not spread, the answer is licence checks inside the
app talking to `/api/passport/verify`, which already exists. That is a
different project.

### Before any of this ships

1. **Decide whether `alchemist.apk` being public is intentional.** If it is a
   free demo, fine. If it is paid, it is currently being given away.
2. **Ship a signed release build, not `app-debug.apk`.** The only APKs in
   `zayvora-workspace` are debug builds. Debug builds are not distributable —
   they are unoptimised, and on some devices refuse to install alongside a
   release.
3. **Clean up `ViaApp-Android/`.** There are 13 build directories
   (`build`, `build (1)` … `build (12)`). Nobody can tell which produced the
   artefact you are selling.
4. **Verify the no-Telegram claim holds in the shipped build.** It is the
   headline differentiator, so it has to be true of the artefact, not just of
   the intent. Grep the release for Telegram tokens, bot endpoints and
   `api.telegram.org` before it goes out — a single leftover import turns the
   main selling point into a refund.

Until 1–3 are done, `zayvora_os` stays `deliverable: false` and returns 503 at
checkout — refusing the sale rather than emailing a dead link.

---

## Part 3 — the desktop DMG, and why the APK should sell it

The Zayvora workspace desktop build (DMG, with the replay feature) is not
sellable yet. That is fine, and it is an asset rather than a gap: **every APK
buyer is a qualified lead for it.** They have already paid, on the same
product line, for the mobile version.

### Reuse what already exists

`create-order.js` already has `logWaitlist(email, product_id, reason)`. Today it
only fires when a purchase is *refused* — kill switch, DB down, SMTP down. It is
a failure-capture mechanism.

The same function captures demand with a different reason:

```js
await logWaitlist(email, 'zayvora_desktop', 'preorder_interest');
```

No new table, no new endpoint. `events` already stores it and the GraphRAG
already reads that table.

### Where to ask

In the APK delivery email, under the download link — the one moment you have
their full attention and they are feeling good about the purchase:

> **Desktop version with session replay is in development.**
> Reply to this email to be told first. No spam, one message when it ships.

A reply is the lowest-friction opt-in there is: no form, no page, no consent
checkbox, and it arrives in an inbox you already read. It also tells you
something a click cannot — anyone who bothers to type is a real prospect.

### What not to do

Do not put a price on it, and do not take pre-orders. A waitlist you miss costs
you an apology; a pre-order you miss costs a refund and your reputation with
exactly the founders you most want. Sell it when the DMG is signed, notarised
and installs cleanly on a machine that is not yours.
