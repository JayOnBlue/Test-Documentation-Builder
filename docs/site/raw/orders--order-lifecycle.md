---
title: "Order Lifecycle"
feature: "Order Lifecycle"
category: "Orders"
description: "How an order moves from Draft to Confirmed, and what happens automatically when it does."
prerequisites:
  - "\"Manage Orders\" permission (or equivalent) to edit an Order record"
order: 10
slug: "order-lifecycle"
---

## Overview

An Order tracks a customer's purchase, made up of one or more Order Lines (products, quantities, and
prices). Sales and fulfillment staff use the Order record to move a purchase from a working draft to a
confirmed sale, at which point the customer is notified automatically.

## Prerequisites

- The Order must have at least one Order Line before it is confirmed.
- The customer's email address must be set on the Order.

## Steps to Navigate

1. Open the Order record and review its Order Lines related list.
2. Change **Status** from *Draft* to *Confirmed* and save.
3. The system marks every Order Line on the order as confirmed and emails the customer automatically —
   no further action is needed.

## Validations & Business Rules

- Changing Status to *Confirmed* triggers `OrderTrigger`, which calls `OrderTriggerHandler` →
  `OrderService.confirmOrders()`.
- `OrderService.confirmOrders()` marks every related Order Line as confirmed, then queues a confirmation
  email via `OrderNotifier` (an `@future` call, so the email is sent asynchronously).
- The **Order Confirmation Email** flow also listens for the same Status change as a second, declarative
  path — see the Technical Docs tab for the full dependency picture.

## Related Features

- See **Technical Docs → OrderService** for the exact method-level behavior and everything that depends on it.
