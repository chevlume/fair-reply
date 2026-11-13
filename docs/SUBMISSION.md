# Fair Reply — Codegeist 2026 submission notes

Author: Chevlume. Project name: Fair Reply. These notes are ready to paste into Devpost. They do not mean the form has been submitted, that a YouTube video exists, or that an installation link has been created. This repository was not published and its visibility was not changed.

Rules quoted below were read from [Codegeist 2026 official rules](https://codegeist2026.devpost.com/rules) and the [overview](https://codegeist2026.devpost.com/) on 13 November 2026. The older URL `https://codegeist.devpost.com/rules` still presented Codegeist 2024 text. Use the 2026 URL.

## Code access: what the 2026 rules require

The 2026 rules do not require a public source repository, and they do not name judge accounts or emails that must be given access to Git.

What they require for judges to test the app is an installation link and instructions:

> Provide access to an installation link for the judges and review team to test your application. To create an installation link, follow the instructions to start sharing your app: https://developer.atlassian.com/platform/forge/distribute-your-apps/#start-sharing-your-app

> Include all necessary instructions to get the app working properly in a judges environment. Detailed instructions must be provided for all configuration steps that must be taken, and any integrations that must be installed and configured.

> The Project must be capable of being successfully installed in a judge’s test environment via an installation link, it must run consistently on the platform for which it is intended, and it must function as depicted in the video and/or expressed in the text description.

Source: [Codegeist 2026 rules, Submission Requirements and Functionality](https://codegeist2026.devpost.com/rules). The overview says the same under “What to Submit”: “Provide access and include all necessary instructions to an installation link.”

There is no sentence in those rules that says “public GitHub repository”, “open-source the code”, or “add these judge emails as collaborators”. The contact addresses in the rules and overview are not repository grants:

> For questions, send an email to support@devpost.com.

The overview also says: “Questions? Email the hackathon manager (janet@devpost.com)”. Those are support contacts, not named judge Git accounts.

Intellectual property, same rules page:

> All Submissions remain the intellectual property of the individuals or organizations that developed them. By submitting a Submission, Entrants agree that the Sponsor will have a fully paid, non-exclusive license to use such Submission for judging the Submission. […] Some Submission components may be displayed to the public. Other Submission materials may be viewed by the Sponsor, Devpost, and Judges for screening and evaluation.

This repository is public, so judges can read the code without being granted access. That is consistent with the text above. It is not a substitute for the installation link. If judges cannot install the app, the functionality requirement is not met, whether or not they can read the code.

This repository is MIT licensed (`LICENSE`, copyright Chevlume, 2026). The rules do not require a particular licence. They allow open source if the entrant complies with those licences. MIT is the licence in this repo. Anyone can read and reuse the code under that licence.

The committed `app.id` is still the placeholder `ari:cloud:ecosystem::app/11111111-1111-4111-8111-111111111111`. Judges cannot install that id. The owner registers the app locally, deploys, and creates the distribution link. Do not paste a link until that link exists.

## Devpost fields

### Tagline

Fair Reply helps a service agent see a possible complaint, the cited sentence, the clock, and whether the public reply covers every point.

### Inspiration

Spain’s Ley 10/2025 gives service customers clocks for complaints, and a billing complaint is often filed as an ordinary question. A Jira Service Management queue does not show that clock or whether the public reply answered each point. Fair Reply is decision support for the agent. It is not legal advice, and it does not decide that an organisation is in scope.

### What it does

On a Jira Service Management work item, Fair Reply reads the request and shows one of four states: Not a complaint, Complaint with clock, Uncovered points, or Ready to close. A complaint shows the sentence that made it a complaint and a deadline in Europe/Madrid: 5 calendar days for billing, 2 clock hours for an informative continuity reply, or 15 business days for a general complaint. A public reply is checked point by point. A covering sentence is quoted as “The reply checked was”. A sentence that was checked and did not cover the point is quoted as “Checked, did not cover”.

A person confirms or overrules the reading only with a written reason. Confirming does not restart the clock. The acknowledgement draft is customer text in Spanish (usted) or English, matching a clear filing language, plus a separate agent note. The draft is not sent. Article 13.6 and 13.7 reminders are advisory and do not by themselves block Resolve. If an admin has added the workflow validator to Resolve or Close, those transitions are blocked while points are open. Until a validator check has been recorded, the panel states that conditional. It does not read the workflow.

Complaints Officer, a Rovo agent, can report status, list stored complaints inside a horizon, check coverage, and draft an acknowledgement. It does not send or resolve.

### How we built it

Atlassian Forge, TypeScript, UI Kit, a rules detector, issue property `fairreply.case`, and the Forge key-value store. Product events enqueue a consumer. A five-minute schedule reminds and backfills recent issues. The validator is the Forge `jira:workflowValidator` module. Tests are Vitest. Forge LLM stays off unless `FAIR_REPLY_LLM=on`.

### Challenges

Telling a complaint from a question without inventing a citation. Counting Madrid business days, including the holidays that are national rather than regional. Keeping a 2-hour continuity clock visible when Forge’s shortest schedule is five minutes. A create event that never reached the consumer. KVS rejecting writes until the `storage:app` scope was installed with `forge install --upgrade`. Not claiming the validator is absent when the panel cannot see the workflow.

### Accomplishments

A panel a judge can name in four states, with the proving sentence copied from the request. Reply coverage that can use a later public comment for a point an earlier comment left open. An unsent acknowledgement in the filing language. Advisory reminders for articles 13.6 and 13.7. A Rovo agent with the same lines as the panel.

### What we learned

The first blind scores were low: 11/40, 14/40, and 17/40 on three held-out files. The later 40/40 scores are regression scores after the rules were generalised by class. Those files are no longer blind. A high regression score is not evidence about unseen wording.

### What's next

Article 13.3 and article 13.8 are not implemented. Article 13.8 was left out on purpose: Fair Reply does not invent the form of the identifying key. UK DISP timeframes are not implemented. The language check is Spanish versus English only. A mixed or unclear filing raises no article 13.6 reminder.

### Built with

Atlassian Forge, Jira Service Management, Rovo, TypeScript, Forge UI Kit, Forge KVS.

### Category

Apps for Specialized Industries.

Justification: the audience is a service team handling customer complaints under a national consumer-service statute, including continuity of a basic service and billing. The app turns that specialised clock and coverage reading into the work item the agent already has. It is not a general software-delivery tool. A support team could also use it, which is why Business Teams is a possible reassignment. The rules allow the sponsor to reassign a category.

### Bonus

Best Agents — Rovo/Assignable agents.

Justification: the manifest declares `rovo:agent` Complaints Officer with four actions: get complaint status, list at-risk complaints, check reply coverage, and draft acknowledgement. The actions read the same case as the panel and do not send a reply.

Not entered, and why:

- Best app with Atlassian MCP: no `rovo:mcp` module.
- Best apps with Teamwork Graph integration: no Teamwork Graph API.
- Best Marketplace published app: not published and not submitted for listing.
- “Runs on Atlassian” is not one of the four bonus prizes on the 2026 rules page. For the record, this manifest does not declare external fetch. It stores the case in an issue property and in Forge KVS. That is not a claim to a prize the 2026 page does not list.

### Testing instructions for judges

Installation link: `[INSTALL_LINK]` — replace this only after `forge install --share` (or the current distribution command in [Start sharing your app](https://developer.atlassian.com/platform/forge/distribute-your-apps/#start-sharing-your-app)) has produced a real link. Do not use the placeholder app id in this repository.

1. Install Fair Reply on a Jira Service Management Cloud site where you are logged in. Forge apps are not visible to anonymous users. Leave `FAIR_REPLY_LLM` unset.
2. Open a company-managed service project. The issue panel title is Fair Reply. Customers do not see it. Users who can edit the work item do.
3. Optional, for the block shown in the video: in Advanced workflow configuration, add the validator named “Block resolve while complaint points are unanswered” to Resolve and Close, then publish the workflow. `jira:workflowValidator` is a Preview module. Atlassian documents it for company-managed projects. This manifest also lists team-managed. The documented path is company-managed. If you skip this step, the panel still classifies and the conditional line explains that Resolve is blocked only when the validator is on the transition.
4. Walk [docs/DEMO.md](DEMO.md). The nine scenarios were exercised on a development demo site. Use synthetic text only. The live demo issues on that site were ITS-6265 through ITS-6274. This repository does not record which key holds which sentence. Match a key by the summary already on the issue. Do not paste real customer data.
5. Confirm and Not a complaint stay disabled until a reason is typed. The hint is “Write a reason to enable”. Confirming does not restart the clock.
6. In Rovo, ask Complaints Officer for status, the at-risk list, coverage, or a draft. A site needs Rovo. Atlassian says demo sites include Rovo. If the at-risk list is empty, it reads the Forge KVS mirror, not every work item on the site.
7. After a scope change, `forge deploy` then `forge install --upgrade`. A deploy that does not change permissions does not need a reinstall.

Local checks, with no site: `npm install`, `npm test`, `npm run typecheck`. `npm run eval` prints the frozen first scores and then the current regression scores.

## Demo video script (about 2 minutes 20 seconds)

Official limit, from the 2026 rules: the video should be less than five minutes, judges are not required to watch beyond five minutes, it must be public on YouTube, and it must show the project functioning. This script stays under two and a half minutes. Narration is English. Do not use copyrighted music. Do not show real customer data. On screen, open the issue in ITS-6265 through ITS-6274 whose summary matches the shot. Do not invent a key if the summary is on a different issue in that range.

| Time | Shot | Say |
| --- | --- | --- |
| 0:00–0:12 | Title: Fair Reply. Jira Service Management issue list, keys ITS-6265 to ITS-6274 visible. | Fair Reply is decision support for a service agent. It is not legal advice. It does not decide that a company is in scope. |
| 0:12–0:32 | Issue whose summary is “Duda sobre mi factura”. Panel: Complaint with clock, Uncovered points, Spanish draft, no send button, agent note. | A billing complaint filed as a question. The sentence that makes it a complaint is quoted from the request. The draft is in Spanish, for the customer. The note under it is for the agent. It has not been sent. |
| 0:32–0:46 | Type a reason. Buttons enable. Confirm. Point at the deadline, unchanged. | The buttons stay off until there is a reason. Confirming does not restart the clock. |
| 0:46–1:05 | Public comment: “Hemos abonado los 48 € del recibo duplicado de marzo.” Point 2 still open. If the validator is attached, try Resolve and show the block naming the open point. | One sentence covered the refund. The corrected invoice is still open. If the validator is on Resolve, the transition stops and names that point. |
| 1:05–1:18 | Second comment: “Adjuntamos la factura corregida.” Ready to close. Draft section gone. | The second comment covers the invoice. Ready to close. A person still resolves. |
| 1:18–1:30 | Issue whose summary is “Horario”. Not a complaint. No clocks. | An hours question is not a complaint. No complaint clock and no follow-up clock. |
| 1:30–1:46 | Issue whose summary is “Cambio de tarifa”. Obligation line, 15 business days. | A future tariff change is not a complaint. The follow-up is 15 business days, not two hours and not five calendar days. Resolve is allowed. |
| 1:46–2:02 | A complaint with a covering refusal that does not name extrajudicial routes. Article 13.7 reminder. | A motivated refusal without the extrajudicial route shows a reminder. That reminder does not by itself block Resolve. |
| 2:02–2:16 | Spanish filing and an English public reply. Article 13.6 reminder. | If the filing is clearly Spanish and the public reply is clearly English, the panel says the reply should be in the same language. Fair Reply does not translate it, and this check is only Spanish versus English. |
| 2:16–2:28 | The four state names, then the frozen scores as text: first blind 11/40, 14/40, 17/40. | A person confirms the result. The first blind scores were 11, 14, and 17 out of 40. Later full scores are regression, not a new blind test. |

## Checklist

- [ ] Owner confirms eligibility (age of majority, country not excluded). This file does not guess either.
- [ ] Owner confirms the project was not built with financial or preferential support from Atlassian or Devpost.
- [ ] `forge register` on the owner’s machine. Do not deploy the placeholder app id.
- [ ] `forge deploy`, then install. After the `storage:app` scope, `forge install --upgrade`.
- [ ] `forge lint` passes on that machine. It was not run in the environment that wrote this file, because the Forge CLI was not installed there.
- [ ] Create the distribution installation link. Paste it over `[INSTALL_LINK]`.
- [ ] Record the video from this script, in English, under five minutes, with the app actually working. Upload it as public on YouTube. Paste the URL.
- [ ] Testing instructions in the form match the video, including the company-managed validator step if the video shows a blocked Resolve.
- [ ] Category: Apps for Specialized Industries. Bonus: Best Agents. Do not tick MCP, Teamwork Graph, or Marketplace.
- [ ] Devpost text in English. Author name on the form: Chevlume.
- [ ] Link the public repository in the submission. The rules quoted above do not require a repo, so the installation link is still required.
- [ ] Do not describe the current 40/40 eval lines as blind.

## Honest limits

The rules detector generalises poorly to wording it has not been shown. The frozen first scores are the evidence. Article 13.6 compares Spanish and English only. Article 13.3 and 13.8 are not implemented. The panel does not know whether the validator is on the workflow until that validator has run. The at-risk list can miss a case that has an issue property but no KVS mirror until the five-minute sweep copies it.
