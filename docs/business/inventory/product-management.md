---
title: "Product & Inventory Management"
feature: "Product Management"
category: "Inventory"
description: "How products and warehouses are tracked, and what happens automatically when stock runs low."
owner: "Ops Enablement"
verified: false
prerequisites:
  - "Edit access to Product and Warehouse records (e.g. via a permission set granted by your Salesforce admin)"
  - "A Warehouse record should exist before it's set as a Product's Primary Warehouse"
related: []
deprecated: false
replacement: ""
order: 10
slug: "product-management"
---

## Overview

Products track what's for sale — SKU, price, tags, and how much stock is on hand — with a lookup to the
Warehouse it's primarily stocked at. Warehouses record where that stock physically lives, along with a
manager and capacity. Inventory staff keep a Product's quantity on hand current as stock moves; whenever an
update drops a Product below its Reorder Threshold, the system flags it as low stock automatically. A Low
Stock Products dashboard component and a read-only integration endpoint let anyone — inside or outside
Salesforce — see which products currently need reordering.

```callout
type: note
"Flagging" low stock today only writes an internal debug log — no email, task, or Chatter post is sent to
anyone. Treat it as a background signal, not a notification, until it's built out further.
```

## Prerequisites

- You need edit access to Product and Warehouse records.
- A Warehouse should already exist if you want to set it as a Product's Primary Warehouse.

## Steps to Navigate

1. Open the **App Launcher** and go to the **Warehouses** tab. Click **New**, fill in **Location**,
   **Manager Name** (required), and **Capacity**, then save.

```screenshot
id: product-management-warehouse-new
alt: New Warehouse form with Location, Manager Name, and Capacity fields
step: Open the App Launcher, go to the Warehouses tab, click New, and fill in the Warehouse fields
url_pattern: /lightning/o/Warehouse__c/new
```

2. Open the **App Launcher** and go to the **Products** tab. Click **New**, fill in **SKU**, **Price**,
   **Quantity On Hand**, **Reorder Threshold**, and optionally **Primary Warehouse** and **Tags** (Seasonal,
   Clearance, Backorder), then save.

```screenshot
id: product-management-product-new
alt: New Product form with SKU, Price, Quantity On Hand, Reorder Threshold, Primary Warehouse, and Tags fields
step: Open the App Launcher, go to the Products tab, click New, and fill in the Product fields
url_pattern: /lightning/o/Product__c/new
```

3. Open the Product record and adjust **Quantity On Hand** as stock moves in or out, then save.

```screenshot
id: product-management-record-page
alt: Salesforce Lightning Product record page showing SKU, Price, Quantity On Hand, Reorder Threshold, and Primary Warehouse
step: Open the Product record just created
url_pattern: /lightning/r/Product__c/{recordId}/view
```

4. If the save drops **Quantity On Hand** below **Reorder Threshold**, the product is flagged as low stock
   automatically — no further action is needed.
5. Add the **Low Stock Products** component (`inventoryDashboard`) to a Home or App page using the Lightning
   App Builder to give inventory staff an at-a-glance view of every product currently below its threshold.

```callout
type: tip
Changing a Product's Price is also logged internally (see Validations & Business Rules below) — useful for
an admin tracing an unexpected price change, even though there's nowhere in the UI to see that log today.
```

## Validations & Business Rules

- No field-level validation rules exist yet on Product or Warehouse — nothing currently stops a negative
  quantity, a negative price, or a blank SKU from being saved. **Manager Name** is the only required field
  (on Warehouse).
- Automation: `ProductTrigger` (before update) calls `ProductTriggerHandler.handleBeforeUpdate()`, which
  compares the incoming **Quantity On Hand** to **Reorder Threshold** on every updated Product and passes any
  that fall below threshold to `InventoryService.flagLowStock()`.
- `InventoryService.flagLowStock()` queues a `LowStockAlertQueueable` job for the flagged products. The job
  only writes an internal debug log per product — nothing is emailed, posted, or shown on the record.
- Automation: `ProductAuditTrigger` (after update) calls `ProductAuditTriggerHandler.handleAfterUpdate()`,
  which similarly only logs internally whenever a Product's **Price** changes — there's no audit field or
  related list showing the history.
- The **Low Stock Notification** flow (`Low_Stock_Notification`) is active and fires whenever a Product is
  updated with Quantity On Hand below Reorder Threshold, but it has no actions configured — it doesn't do
  anything visible yet.

```callout
type: warning
Don't rely on the Low Stock Notification flow, the price-change audit log, or the low-stock queueable as a
real alerting path today — all three currently only produce internal debug output that nobody sees. The only
way to actually notice low stock right now is the Low Stock Products component or the integration endpoint
below.
```

- `LowStockCheckBatch` scans every Product for the same below-threshold condition and calls the same
  `InventoryService.flagLowStock()`. This is a batch job and must be run or scheduled by an admin (Setup →
  Apex Jobs) — it does not run on its own on a timer.
- The **Low Stock Products** component (`inventoryDashboard`) and `InventoryService.getLowStockProducts()`
  show every Product where Quantity On Hand is less than Reorder Threshold, lowest quantity first.
- Integration access: `GET /services/apexrest/inventory/` returns the same low-stock product list, for
  external systems. It's read-only and respects the calling user's record access (`with sharing`).

## Related Features

- None yet documented.
