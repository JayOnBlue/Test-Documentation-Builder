---
title: "Support Ticket Management"
feature: "Support Ticket Management"
category: "Support"
description: "How customer support tickets are logged, triaged by priority, escalated when they go stale, and tracked to resolution."
owner: "Support Ops"
verified: false
prerequisites:
  - "Edit access to Support Ticket and Support Ticket Comment records (e.g. via a permission set granted by your Salesforce admin)"
  - "The Open Tickets component must be added to a Lightning record page (via Lightning App Builder) before agents can see the ticket queue there"
  - "For tickets to auto-escalate after sitting open for 2 days, the `TicketEscalationSchedulable` Apex class must be scheduled (Setup → Apex Classes → Schedule Apex)"
related: []
deprecated: false
replacement: ""
order: 10
slug: "support-ticket-management"
---

## Overview

A Support Ticket tracks a customer issue from the moment it's logged through to resolution. Support agents
work tickets from an Open Tickets list, adjust Status and Priority as they investigate, and add Comments to
keep a record of the back-and-forth on the case. Tickets that sit in *Open* status too long are automatically
escalated so they don't get missed.

```callout
type: warning
Marking a ticket Escalated — whether done manually or automatically after 2 days — does not currently send
an email, Chatter post, or any other notification to anyone. Both the escalation Apex logic and the
accompanying flow only log the event today, so escalated tickets must still be manually surfaced to the
right team.
```

## Prerequisites

- Edit access to Support Ticket and Support Ticket Comment records (e.g. via a permission set granted by
  your Salesforce admin)
- The Open Tickets component must already be placed on a Lightning record page for agents to see the queue
  view described below
- The `TicketEscalationSchedulable` scheduled job must be scheduled to run for tickets to auto-escalate —
  otherwise stale tickets stay Open indefinitely

## Steps to Navigate

1. Open the **App Launcher** and go to the **Support Tickets** tab.

```screenshot
id: support-ticket-management-app-launcher
alt: Salesforce App Launcher showing the Support Tickets tab
step: Open the App Launcher and select the Support Tickets tab
url_pattern: /lightning/app/AppLauncher
```

2. Click **New**, fill in **Subject** and **Customer Email**, and save to log a ticket. **Status** defaults
   to *Open* and **Priority** defaults to *Low* if you don't set them yourself.

```screenshot
id: support-ticket-management-create-ticket
alt: New Support Ticket form with Subject and Customer Email fields filled in, before saving
step: Click New on the Support Tickets tab and fill in Subject and Customer Email
url_pattern: /lightning/o/SupportTicket__c/new
```

3. Open a ticket record to review it and work the case. Use the **Comments** related list to see the
   conversation history, or click **New** there to add a comment (**Author** and **Comment Text**).

```screenshot
id: support-ticket-management-record-page
alt: Salesforce Lightning Support Ticket record page showing Subject, Status, Priority, Customer Email, and the Comments related list
step: Open a Support Ticket record just created
url_pattern: /lightning/r/SupportTicket__c/{recordId}/view
```

4. As you triage and work the case, update **Priority** (*Low* / *Medium* / *High* / *Urgent*) and
   **Status** (*Open* / *In Progress* / *Escalated* / *Closed*).
5. To see everything that still needs attention at a glance, check the **Open Tickets** component wherever
   it's been added to a record page — it lists every ticket with a Status of *Open* or *In Progress*,
   sorted with the highest Priority first.

```screenshot
id: support-ticket-management-open-tickets-component
alt: Open Tickets card listing support tickets by subject and priority
step: View the Open Tickets component on the record page it has been added to
```

## Validations & Business Rules

- New tickets are automatically set to Status = *Open* if no Status is provided on save
  (`SupportTicketTrigger` → `SupportTicketTriggerHandler.handleAfterInsert` →
  `TicketAssignmentService.assignOwners`). This step does not assign the ticket to a specific owner or
  queue today — it only defaults the Status.
- A ticket left with Status = *Open* for more than 2 days is automatically switched to *Escalated* by the
  `TicketEscalationSchedulable` scheduled Apex job — but only once that job has actually been scheduled to
  run (see Prerequisites).
- Whenever a ticket's Status changes to *Escalated* — manually or via the scheduled job —
  `TicketAssignmentService.notifyEscalationTeam` runs, and a `Ticket Escalation Notification` flow also
  fires on the same change. Neither currently sends a real notification (see the warning above).
- Adding a Comment does not change the parent ticket's Status or notify anyone —
  `SupportTicketCommentTriggerHandler` currently only records that a comment was added.
- Comments inherit the same record-level visibility as their parent Support Ticket.
- The **Open Tickets** component shows tickets with Status *Open* or *In Progress* only, ordered by
  Priority (highest first); *Escalated* and *Closed* tickets drop off this list.

## Related Features

- None yet — this is the first Support Ticket Management page in these docs.
