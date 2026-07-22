---
title: "Order Lifecycle"
feature: "Order Lifecycle"
category: "Orders"
description: "How an order moves from Draft to Confirmed, and what happens automatically when it does."
owner: "Ops Enablement"
verified: true
prerequisites:
  - "\"Manage Orders\" permission (or equivalent) to edit an Order record"
related:
  - "order-adjustments-cancellations"
order: 10
slug: "order-lifecycle"
---

## Overview

An Order tracks a customer's purchase, made up of one or more Order Lines (products, quantities, and
prices). Sales and fulfillment staff use the Order record to move a purchase from a working draft to a
confirmed sale, at which point the customer is notified automatically.

```callout
type: before
The Order needs at least one Order Line, and the Order's Customer Email must be set, before you
confirm it — otherwise the confirmation email has nothing to send and nowhere to send it.
```

## Prerequisites

- The Order must have at least one Order Line before it is confirmed.
- The customer's email address must be set on the Order.

## Steps to Navigate

1. Open the **App Launcher** and select the **Order Management** app.

```screenshot
id: order-lifecycle-app-launcher
alt: Salesforce App Launcher showing the Order Management app tile
step: Open the App Launcher and select the Order Management app
url_pattern: /lightning/app/AppLauncher
```

2. Click the **Orders** tab.

```screenshot
id: order-lifecycle-orders-tab
alt: Orders tab list view showing existing Order records
step: Click the Orders tab in the navigation bar
url_pattern: /lightning/o/Order__c/home
```

3. Click **New**, fill in the Customer Email, and save to create an Order.

```screenshot
id: order-lifecycle-create-order
alt: New Order form with the Customer Email field filled in, before saving
step: Click New on the Orders tab and fill in the Customer Email field
url_pattern: /lightning/o/Order__c/new
```

4. Open the Order record and review its Order Lines related list.

```screenshot
id: order-lifecycle-record-page
alt: Salesforce Lightning Order record page showing Status, Customer Email, Total Amount, and the Order Lines related list
step: Open the Order record just created
url_pattern: /lightning/r/Order__c/{recordId}/view
```

5. Change **Status** from *Draft* to *Confirmed* and save.
6. The system marks every Order Line on the order as confirmed and emails the customer automatically —
   no further action is needed.

```callout
type: note
Sending the confirmation email happens asynchronously (`@future`), so it won't appear in the same
transaction — allow a few seconds after saving before the email is actually sent.
```

## Validations & Business Rules

- Changing Status to *Confirmed* triggers `OrderTrigger`, which calls `OrderTriggerHandler` →
  `OrderService.confirmOrders()`.
- `OrderService.confirmOrders()` marks every related Order Line as confirmed, then queues a confirmation
  email via `OrderNotifier` (an `@future` call, so the email is sent asynchronously).
- The **Order Confirmation Email** flow also listens for the same Status change as a second, declarative
  path — see Technical Reference for the full dependency picture.

```callout
type: warning
There is no undo for confirming an order from this screen. To reverse a confirmed order, see
**Order Adjustments & Cancellations**.
```

## Related Features

- See **Technical Reference → OrderService** for the exact method-level behavior and everything that
  depends on it.
