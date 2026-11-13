# Fair Reply

Fair Reply is an [Atlassian Forge](https://developer.atlassian.com/platform/forge/) app for Jira Service Management. It reads a customer request, decides whether the words are a complaint, cites the sentence it used, and shows a deadline counted from the work item's created time. It then checks whether a public reply covers each customer point.

An agent can confirm the reading or mark the request as not a complaint. A workflow validator can stop a resolve or close transition while points are still unanswered. A Rovo agent, Complaints Officer, can report status, list requests near their deadline, check coverage, and draft an acknowledgement. The draft is text only. The app does not send it.

This is decision support. A human confirms the classification and the deadline. This is not legal advice. Fair Reply does not decide that an organisation is legally obliged. It shows the clock that would apply if the organisation is in scope of the assumptions below.

Author: Chevlume. License: MIT (see `LICENSE`). This repository was written for Codegeist 2026 and does not reuse an earlier Fair Reply codebase. Submission notes are in [docs/SUBMISSION.md](docs/SUBMISSION.md).

UK DISP complaint-handling timeframes are not implemented. They are a roadmap item only.

## Judge path (about 90 seconds)

The honest blind scores are frozen. They are not the later regression numbers.

| Set | First blind score | What that number is |
| --- | --- | --- |
| `fixtures/independent.json` | **11/40** | First run, before the rules were changed for that file |
| `fixtures/r3.json` | **14/40** | First run, before the rules were changed for that file |
| `fixtures/r4.json` | **17/40** | First run, before the rules were changed for that file |

A full success on those runs needed the right complaint decision, the right clock, and a literal proving sentence. Invented citations were 0. After those misses were seen, the rules were generalised by class. The later 40/40 scores on independent, r3, and r4 are regression scores. Those three files are no longer holdouts. `npm run eval` prints the frozen first lines and then the current lines. Do not describe the current 40/40 as blind.

The panel uses four states a judge can name: **Not a complaint**, **Complaint with clock**, **Uncovered points**, **Ready to close**. A person confirms or overrules the detector only with a short reason. `confirmationAt` is that review time in Europe/Madrid. `startedAt` stays the filing anchor from issue created. Confirming does not restart the clock. Dismissing clears the running deadline. The reason is a review note, not a legal finding, and it does not replace a public reply. This is decision support, not legal advice.

Walk one synthetic ticket. Summary: `Duda sobre mi factura`. Description: the `es-h1` text in `fixtures/tickets.json`. No real customer, no personal name.

1. The request is filed as a billing question. Fair Reply reads it as a hidden complaint. The panel shows **Uncovered points** and **Complaint with clock**. The proving sentence is `Es la tercera vez que os lo digo y exijo que me devolváis los 48 €.`
2. The clock is billing: 5 calendar days in Europe/Madrid. The law says 5 days and does not call them business days. Created Friday 6 Nov 2026 at 10:02 Madrid, the demo deadline is Wednesday 11 Nov 2026 at 10:02 Madrid (`2026-11-11T09:02:00.000Z`). `fields.created` is only the demo anchor when it matches filing of a complete case. The panel says the law may apply if the organisation is in scope. It does not say that it does.
3. Post one public comment that only refunds the 48 EUR: `Hemos abonado los 48 € del recibo duplicado de marzo.` The panel stays **Uncovered points**. Point 1 quotes that sentence as the reply that covered it (`The reply checked was`). Point 2, `También necesito la factura corregida.`, stays open. The refund sentence may have been checked against it; the panel and the validator then say `Checked, did not cover`, which is a different line from a covering citation. The validator blocks Resolve and names point 2.
4. Post a second public comment: `Adjuntamos la factura corregida.` Point 1 still quotes the refund sentence. Point 2 quotes the invoice sentence. Each point uses the comment that covered it. The panel moves to **Ready to close**. The validator allows the transition. A person resolves.
5. One comment does not have to carry every point. A later public comment can cover a point an earlier comment left open. With no public reply at all, the validator blocks and names both open points.
6. The last line is: "A human confirms this result. Decision support, not legal advice." **Not a complaint** clears the complaint clock. A consulta or a continuity question may still need a review.

## What you can run without a Jira site

The deadline engine, the rules detector, reply coverage, the validator decision, and the panel model are plain TypeScript. They do not call Jira, Rovo, or Forge LLM.

```bash
npm install
npm test
npm run eval
```

`npm test` and `npm run eval` need no `forge login` and no site. The eval prints the fixture and hard regression scores, then the frozen first blind scores, then the current scores. The current 40/40 lines are not blind:

```text
Fair Reply rules detector (fixtures): 30/30
Fair Reply rules detector (hard): 30/30
Fair Reply independent (full): 40/40
Independent misses: none
r3 FIRST full: 14/40
r3 full: 40/40
r4 FIRST full: 17/40
r4 full: 40/40
```

`fixtures/tickets.json` is the original set, written with this project. `fixtures/hard.json` is a later set, also written with this project. `fixtures/independent.json` was written separately and is hashed `31a1afc6f71eb341cf39ffc9872992cb282aabb7e80e11213f549ee3fbbf00a9`. Its frozen first score is 11/40 full: 12 of 28 complaints recovered, 3 of 12 false alarms, 1 wrong clock, and 0 invented citations. The rules were then changed. The later 40/40 on that file is not a blind score.

`fixtures/r3.json` is hashed `4736aa53dd7d39a698483c282ef92cd2b801c472e046c7605f75ea3cd0d32617`. Its first blind run, before any rule change, was 14/40 full, 14/28 complaints recovered, 3/12 false alarms, 2 wrong clocks, and 0 invented citations. Rules were then changed by class. It is no longer a blind holdout. The current score is 40/40 full, 28/28 recovered, 0/12 false alarms, 0 wrong clocks, and 0 invented citations.

`fixtures/r4.json` is hashed `e396ccde8956eef7592a426321f3b6e29169f235fc53beac43449a0fcd42e5ec`. Its first blind run, before any rule change, was 17/40 full, 16/28 complaints recovered, 2/12 false alarms, 5 wrong clocks, and 0 invented citations. Rules were then changed by class. It is no longer a blind holdout. The current score is 40/40 full, 28/28 recovered, 0/12 false alarms, 0 wrong clocks, and 0 invented citations.

`npm run typecheck` runs the TypeScript compiler. The Forge UI Kit panel is typechecked here. It renders inside Jira after install, so this repository does not start a browser dev server.

## Modules

`manifest.yml` declares these documented Forge module types:

| Module | Role |
| --- | --- |
| `jira:issuePanel` (`render: native`) | UI Kit panel: classification, cited sentence, deadline, points, confirm / not-a-complaint, disclaimer |
| `trigger` | `avi:jira:created:issue`, `avi:jira:commented:issue`, `avi:jira:updated:issue`, with `ignoreSelf: true` |
| `consumer` | Async queue `fair-reply-queue`. The consumer function allows 120 seconds |
| `jira:workflowValidator` | Blocks resolve/close while a complaint has unanswered points or no public reply. Company-managed and team-managed |
| `scheduledTrigger` | Internal reminder every five minutes when a deadline is inside 24 hours or already due. `fiveMinute` is the shortest Forge interval |
| `rovo:agent` | Name `Complaints Officer` (18 characters, limit 30) |
| `action` | `get-complaint-status`, `list-at-risk-complaints`, `check-reply-coverage`, `draft-acknowledgement` (GET, draft is not sent) |
| `llm` | Declares the Claude family so a later opt-in does not need a manifest change. The default path does not call it |

Product events can take a few minutes to arrive. The validator does not wait for that. If no case is stored yet, it runs the same rules on the work item and then decides. It never calls Forge LLM.

The case is stored on the work item as the issue property `fairreply.case`:

```json
{
  "isComplaint": true,
  "quote": "literal sentence from the customer",
  "category": "billing",
  "startedAt": "2026-11-06T09:02:00.000Z",
  "deadlineAt": "2026-11-11T09:02:00.000Z",
  "points": ["..."],
  "answered": [false]
}
```

Operational fields sit beside that shape: `confirmation` (`pending`, `confirmed`, `dismissed`), `hasPublicReply`, `engine`, `needsHumanReview`, `remindedAt`, and `ruleLabel`. A human dismissal stays in force until someone confirms the request again. In this demo the clock is counted from `fields.created`, not from the moment of classification, and only when that timestamp matches filing of a complete case.

A copy of the case is also written to Forge KVS so the at-risk list and the five-minute reminder can walk known work items. The issue property is what the panel and the validator read. `@forge/kvs` requires the `storage:app` scope. Without it, `kvs.set` fails with `PRINCIPAL_NOT_AUTHORIZED`, the at-risk list stays empty, and the five-minute job fails in `listMirroredCases` before it can post. An existing install does not gain a new scope from deploy alone. After this change, run `forge deploy`, then `forge install --upgrade`.

Scopes, all requested in the manifest: `read:jira-work`, `write:jira-work`, `manage:jira-configuration`, `storage:app`. There is no Forge Remote backend and no API key.

## Legal assumptions

Spain only, for this MVP. Ley 10/2025 is the regime the deadlines are parameterised for. The app does not quote the statute and it does not say that a particular company is in scope.

| Category | Clock | How it is counted |
| --- | --- | --- |
| General complaint | 15 business days maximum | Madrid business days. Aim sooner. Sector rules can differ. |
| Billing | 5 calendar days | The law says 5 days, without calling them business days. Prudent operational target: 5 calendar days in Europe/Madrid. Needs legal or sectoral review. |
| Basic-service continuity | 2 clock hours | An informative reply about the known cause and expected restoration for continuity on a basic continuous service. Not a promise to repair. Not the clock for every complaint or every outage. |

A consulta or an incidencia can still have an article 17 response time when it is not a complaint. Fair Reply shows that as an obligation, not a complaint clock, and does not block close for it. A scheduled cancellation or a future tariff change uses the general response time of 15 business days. The two-hour clock stays for continuity of a basic service, not for a baja. An immediately answerable how-to or hours question stays without that clock. Sectoral rules can prevail. This is not a universal SLA for insurance, banking, or telecom.

A request that is not a complaint can still need a review. Consultas and incidencias can carry their own timing, especially a continuity question. `fields.created` is only the demo anchor when it matches filing of a complete case. A prior call, an imported message, or a later completion can move the legal start. A public Jira comment is the demo's public reply. It is not, by itself, proof of a legally notified resolution.

A person confirms the reading and the period. Sector rules can prevail. This is decision support, not legal advice, and not a certificate of compliance.

If a request matches both an outage and a billing pattern, the outage clock is used. That is the urgent reading for a basic-service interruption.

Business days are Monday to Friday in `Europe/Madrid`. The created calendar day is not counted. The Madrid wall-clock time is kept, including across the daylight-saving change. Billing uses calendar days, so weekends count. Created Friday 6 Nov 2026 at 10:02 Madrid, a billing complaint in this demo is due Wednesday 11 Nov 2026 at 10:02 Madrid. A general complaint from the same instant is due Friday 27 Nov 2026 at 10:02 Madrid, 15 business days, aim sooner.

National holidays are encoded for 2026 and 2027 from the labour calendars published in BOE-A-2025-21667 and BOE-A-2026-21254. The list is the holidays observed in every autonomous community and both autonomous cities, plus statutory national dates that fall on a Sunday (those do not remove a weekday). Regional and local holidays are out of scope. Jueves Santo is not encoded, because those annexes do not mark it for Catalonia and the Valencian Community. Monday substitutes used by only some communities are not encoded either.

The workflow validator is aligned with this product's reading of Ley 10/2025 articles 13.1 and 13.2: keep the request open while customer points are unanswered, including after the deadline has passed. The validator stops the Resolve or Close transition it is attached to. A lawyer needs to confirm the reading before anyone relies on it.

When a covering reply looks like a motivated refusal and does not mention extrajudicial dispute-resolution systems, how to access them, Ley 7/2017, or accredited or sectoral bodies, the panel reminds the agent about article 13.7. Fair Reply does not name or validate a specific body. Missing that information does not by itself block Resolve. Article 13.8 is not implemented.

If the filing is clearly Spanish and the public reply is clearly English, or the reverse, the panel reminds the agent that article 13.6 asks for the reply in the same language as the filing. Fair Reply does not translate or send the reply. A missing match does not by itself block Resolve. Mixed or unclear text raises no reminder.

## Detector

Rules run first, in Spanish and English. They return a sentence copied from the ticket. A how-to question ("How do I request a refund…?") and a thank-you note are not complaints, even if they mention a bill or a refund.

Forge LLM code is in `src/detect/forgeLlm.ts`. It uses `@forge/llm` with `claude-haiku-4-5-20251001`, and only through a dynamic import after `FAIR_REPLY_LLM=on`. Tests and the default consumer do not call it. When it is enabled, it is used only for text the rules mark as ambiguous. Every quote and point is checked with `String.includes`. Anything that is not a substring is discarded and the rules result is kept, flagged for a human.

Do not turn the model on unless you accept the charge. Forge LLM has no free quota. Usage is billed to the app developer, including use on a judge's site. Enabling it also makes an admin review the `llm` module.

```bash
forge variables set FAIR_REPLY_LLM on
forge deploy
```

Unset, or any value other than `on`, keeps the rules-only path.

Reply coverage is rules-based. A point counts as answered when the public agent reply shares enough of the customer's words, or a domain synonym (refund / abono, invoice / factura, water, power, appointment) together with the amount they named. "We are reviewing your request" does not cover a point. Internal notes and customer comments do not count as the reply.

## Eval

`fixtures/tickets.json` has 30 synthetic requests: 15 Spanish, 15 English, 12 hidden complaints, 8 explicit complaints, and 10 requests that are not complaints. There are no real people, account numbers, or company names. Hidden complaints are filed as an ordinary question ("Duda sobre mi factura") and still contain a demand or a repeated failure.

`npm run eval` scores complaint / not complaint, category, and the cited sentence. It prints the frozen first scores and the current regression scores. The current 40/40 results are on sets that are no longer holdouts.

| Set | Score |
| --- | --- |
| `fixtures/tickets.json` | **30/30** |
| `fixtures/hard.json` | **30/30** |
| `fixtures/independent.json` full successes | **40/40** |
| Independent set before this pass | **11/40** |
| `fixtures/r3.json` first blind score | **14/40** |
| `fixtures/r3.json` after class changes (no longer blind) | **40/40** |
| `fixtures/r4.json` first blind score | **17/40** |
| `fixtures/r4.json` after class changes (no longer blind) | **40/40** |

The 6/30 run missed a repeated charge, gas or lights going out, a stuck name change, a polite written protest, and it treated "si esto fuera una queja" and "if this were a formal complaint" as complaints. Those are classes of phrasing, not single sentences kept as special cases.

Install and a copy-paste demo script are in [docs/DEMO.md](docs/DEMO.md). The app is deployed to the Forge production environment, and judges install it from the installation link in the Devpost submission.

## Deploy your own copy

You need Node.js 22, a Forge API token, and a Jira Service Management Cloud site. To deploy your own copy, run `forge register` first so the app gets an app ID of your own.

The committed `app.id` is a placeholder (`11111111-1111-4111-8111-111111111111`). Register the app once so the CLI writes a real id:

```bash
npm install -g @forge/cli
forge register
```

If register refuses the placeholder, delete the `app.id` line and run `forge register` again. Then:

`forge lint` must pass before `forge deploy`.

```bash
npm install
forge deploy
forge install --site your-site.atlassian.net --product jira
```

Accept the scopes. Open a work item in the new issue view. Users who can edit the work item see the Fair Reply button above Activity. Customers do not. The panel says the same disclaimer as this file.

To load sample tickets, create a service request and paste one `summary` and `description` from `fixtures/tickets.json` or `fixtures/hard.json`. Start with `es-h1`. Do not paste real customer data. There is no importer and no external account.

### Add the workflow validator

A Jira admin has to add the validator before it can stop a transition. The panel works before that step. Add it to every transition that finishes the request, including a transition an automation rule uses. A status change that never runs workflow validators is outside this validator.

Company-managed projects:

1. Go to Jira settings, then Work items, then Workflows.
2. Edit the workflow used by the service project.
3. Select the transition into Resolved, and again the transition into Closed or Done, for every path that finishes the request.
4. Open Validators and add a validator.
5. Choose **Block resolve while complaint points are unanswered** (Fair Reply).
6. Publish the workflow.

Team-managed projects: the manifest sets `projectTypes` to `company-managed` and `team-managed`. In Project settings, edit the workflow, open the same finishing transitions, and add the same validator.

The error the agent sees names the open point and the reply sentence that was checked. The block is the uncovered point. That block happens only when this validator runs. If it is not on the transition, Resolve still succeeds. Until a validator check is recorded, the panel states the conditional: if an admin added the validator to Resolve/Close, those transitions are blocked while points are open; otherwise the panel only monitors. The panel does not read the workflow. One internal note records that the request was marked resolved while points were still uncovered. The app does not reopen the work item and does not call that note a block. The `es-h1` walkthrough above is the path where the validator is attached.

### Rovo

Complaints Officer needs Rovo. Rovo is a bonus. The panel, the clock, and the validator work without it. Free developer sites often have no Rovo. A demo site is the documented way to get enterprise Jira, Confluence, Jira Service Management, and Rovo for a limited period, one site per developer:

```bash
forge site provision
forge install --demo-site
```

See [Provision a demo development site](https://developer.atlassian.com/platform/forge/provision-a-demo-development-site/).

The issue panel shows the same customer-facing acknowledgement draft as Complaints Officer while the case is a complaint and no public reply exists. Spanish filings get a Spanish draft (usted); other filings get English. The agent note under it carries the FR marker, says it does not fulfil article 12, and says the draft has not been sent. There is no send or post button. The panel footer keeps one disclaimer. Dismissed cases, non-complaints, and cases that already have a public reply do not show the draft.

In Rovo chat, ask for status, the at-risk list, reply coverage, or a draft acknowledgement. Complaints Officer uses the same four states as the panel, the same clock labels, and the same citation lines. `The reply checked was` appears only when that sentence covered the point. An open point says `Checked, did not cover`. Two public comments can cover two points. Status, coverage, the panel, and the at-risk list analyse new public comments in the same request. The at-risk list refreshes at most eight cases per call, soonest deadline first, and skips a case whose work item cannot be read. `draft-acknowledgement` returns a reply a person can edit. It says the customer should receive an identifying key, it does not invent the form of that key, and `sent`, `posted`, and `customerReplySent` are false. It does not post a public comment or a customer reply. Ready to close allows the transition. A person resolves. Reminders are internal notes and do not send the customer reply.

## Reminder

Forge scheduled triggers allow `fiveMinute`, `hour`, `day`, and `week`. `fiveMinute` is the shortest interval the platform documents, and an app may declare only one trigger at that interval. This app uses that one `fiveMinute` trigger. An hourly tick can fall after the two-hour continuity window when a run is late or fails, and Forge does not retry a failed scheduled invocation.

The same run searches work items created in the last day (`created >= -1d`) that this app can see, reads one page of 50, and makes at most eight writes. A write is a new case for an issue with no `fairreply.case` property, or a KVS copy of that property when the case was saved while KVS was unavailable. An issue already in KVS is left as it is. The sweep does not post a customer reply.

When a complaint deadline is inside 24 hours or already past, and a public reply still does not cover the points, the app posts one internal comment. A continuity case is eligible on the first tick after it is stored, which is inside the two-hour informative reply (cause and expected restoration, not a repair promise). The Jira comment property `sd.public.comment` is set to `{ "internal": true }`. A further reminder waits 20 hours, so the five-minute job does not post on every tick. The panel shows the two-hour deadline as soon as the case exists. Billing stays 5 calendar days in Europe/Madrid.

## Not in this version

No Customer Service Management modules, no Teamwork Graph, no Marketplace listing, no UK DISP behaviour, no external service, and no stored credentials. Forge LLM stays off unless you set the variable above.
