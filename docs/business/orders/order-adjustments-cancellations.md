---
title: "Order Adjustments & Cancellations"
feature: "Order Adjustments & Cancellations"
category: "Orders"
description: "How to reverse or adjust an order after it's been confirmed."
owner: "Ops Enablement"
verified: true
prerequisites:
  - "\"Manage Orders\" permission (or equivalent)"
related:
  - "order-lifecycle"
order: 20
slug: "order-adjustments-cancellations"
---

## Overview

Once an Order is Confirmed, changing it isn't as simple as editing the record — Order Lines have already
been marked confirmed and a customer email has already gone out. This page covers the supported ways to
adjust quantities or cancel a confirmed order without leaving the data inconsistent.

```callout
type: warning
Never delete Order Line records directly on a Confirmed order. Use the steps below instead — deleting
a line bypasses the validation that keeps the Order's totals in sync.
```

## Prerequisites

- The Order must currently be in **Confirmed** status.
- You'll need the customer's confirmation before changing quantities or cancelling — this page doesn't
  cover the customer-communication policy, only the Salesforce steps.

## Steps to Navigate

1. Open the Order record.
2. To adjust a quantity: edit the relevant Order Line's **Quantity** field and save. The Order's totals
   recalculate automatically.
3. To cancel entirely: change the Order's **Status** to *Cancelled* and save.

```callout
type: note
This demo project doesn't implement a separate cancellation trigger path — in a real org, this is
usually where you'd add a validation rule or a second Apex trigger branch, tracked as a Related Feature
below once it exists.
```

## Validations & Business Rules

- Quantity changes on a Confirmed Order Line do not currently re-trigger the confirmation email — only
  the initial Draft → Confirmed transition does (see `OrderTrigger`).
- There is no distinct "Cancelled" handling in `OrderTriggerHandler` yet in this sample project; treat
  this page as the template for where that logic would be documented once it's built.

## Related Features

- See **Order Lifecycle** for how an order gets to Confirmed in the first place.
