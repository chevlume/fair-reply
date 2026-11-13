# Install Fair Reply and walk the demo

This file is a guide. It does not mean the app is installed, and it does not mean anyone has logged in. The committed app id in `manifest.yml` is a placeholder: `ari:cloud:ecosystem::app/11111111-1111-4111-8111-111111111111`.

Leave `FAIR_REPLY_LLM` unset. This repository has no API tokens.

Official references:

- [Getting started](https://developer.atlassian.com/platform/forge/getting-started/)
- [Build a Jira Service Management hello world app](https://developer.atlassian.com/platform/forge/build-a-hello-world-app-in-jira-service-management/)
- [Demo development sites](https://developer.atlassian.com/platform/forge/provision-a-demo-development-site/)
- [Workflow validator tutorial](https://developer.atlassian.com/platform/forge/check-jira-issues-assigned-using-workflow-validator/)
- [`jira:workflowValidator`](https://developer.atlassian.com/platform/forge/manifest-reference/modules/jira-workflow-validator/)

## What the manifest declares

Panel title: **Fair Reply** (`jira:issuePanel`, `render: native`).

Validator name: **Block resolve while complaint points are unanswered**. Atlassian documents `jira:workflowValidator` as a Preview module that applies to company-managed projects. This manifest also lists `team-managed` under that module. The documented way to attach it is the company-managed path below.

Scopes: `read:jira-work`, `write:jira-work`, `manage:jira-configuration`, `storage:app`.

Other modules: issue events `avi:jira:created:issue`, `avi:jira:commented:issue`, `avi:jira:updated:issue` (ignore self), queue consumer `fair-reply-queue`, scheduled trigger interval `fiveMinute`, Rovo agent **Complaints Officer**.

## Install

A developer site lasts 90 days. Each developer can have one active demo site.

```bash
npm install -g @forge/cli
forge register
forge site provision
forge deploy
forge install --demo-site
```

`forge install -d` is the short form of `forge install --demo-site`. It installs on the latest active demo site, or offers to provision one.

`forge lint` must pass before `forge deploy`.

`forge deploy` comes before `forge install`. The default environment is development unless the developer already set another. Do not run `forge deploy -e production`.

`forge install` without `--demo-site` prompts for an existing site URL, such as `example.atlassian.net`, and for the Atlassian app (Jira). Do not combine `--demo-site` with `--site`.

Forge apps cannot be viewed by anonymous users. The tester must be logged in.

After the first install, a later `forge deploy` that does not change permissions is picked up without reinstalling. A manifest change can take up to about five minutes to show.

`storage:app` is a scope change. On an install that is already on the site, run `forge deploy`, then `forge install --upgrade`.

Without the validator on the Resolve and Close transitions, the panel only monitors. It does not stop the transition. Complaints Officer needs a site with Rovo. Atlassian says demo sites include Rovo.

## Add the validator

On a company-managed project, open **Advanced workflow configuration**, add the validator named **Block resolve while complaint points are unanswered**, and publish the workflow.

If that validator is not on the transition, Resolve still succeeds. Fair Reply can leave one internal note. It does not reopen the work item.

## Demo script

Use synthetic text only. Created time in these checks is the demo anchor Friday 6 Nov 2026, 10:02 Europe/Madrid, when you can set it. Otherwise read the clock the panel shows from `fields.created`.

1. Create a request. Summary: `Duda sobre mi factura`. Description: `Quería comentar un cargo del recibo. Es la tercera vez que os lo digo y exijo que me devolváis los 48 €. También necesito la factura corregida.` Expect **Complaint with clock** and **Uncovered points**, including the 48 € refund and the corrected invoice. The **Draft acknowledgement** section is visible and the customer text is in Spanish. There is no send or post button. The agent note says the marker is not the article 12 identifying key.

2. Type a reason in **Why this decision**. **Confirm complaint** and **Not a complaint** stay disabled until the reason is not empty. Confirm. The complaint clock does not restart. `confirmationAt` is the review time, not a new filing time.

3. Post this public comment only: `Hemos abonado los 48 € del recibo duplicado de marzo.` The panel stays **Uncovered points**. Point 1 uses `The reply checked was` for that sentence. Point 2, the corrected invoice, stays open. If that refund sentence is the one checked against point 2, the line is `Checked, did not cover`.

4. With the validator attached, Resolve or Close is blocked and names the open point. Until a validator check is recorded, the panel states the conditional: if the admin added the validator, those transitions are blocked while points are open; otherwise the panel only monitors. It does not claim to have read the workflow. Without the validator, Resolve can still succeed.

5. Post a second public comment: `Adjuntamos la factura corregida.` Point 2 quotes that sentence. The panel moves to **Ready to close**. Resolve is allowed. A person still resolves.

6. Create another request. Summary: `Horario`. Description: `¿Cuál es el horario de la oficina?` Expect **Not a complaint**, no complaint clock, and no article 17 obligation clock.

7. Create another request. Summary: `Cambio de tarifa`. Description: `Quiero cambiar la tarifa a la modalidad plana desde el mes que viene. La tarifa actual es correcta.` Expect **Not a complaint** and an obligation line with 15 business days. Not 2 hours. Not 5 calendar days. Resolve is allowed.

8. On a complaint, post a covering motivated refusal that does not name extrajudicial routes, for example: `No podemos devolver los 48 € porque la lectura del contador coincide con la tarifa contratada.` Expect the article 13.7 reminder. That reminder does not by itself block Resolve.

9. On the Spanish billing request, post an English public reply, for example: `We have refunded the 48 EUR of the duplicate March bill.` Expect the article 13.6 reminder. Fair Reply does not translate or send the reply. A missing language match does not by itself block Resolve.
