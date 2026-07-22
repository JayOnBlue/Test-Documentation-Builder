---
title: "Invoice Management"
feature: "Invoice Management"
category: "Finance"
description: "How invoices are billed and paid, how vendor contracts are tracked for upcoming expiry, and what happens automatically along the way."
owner: "Finance Ops"
verified: false
prerequisites:
  - "Edit access to Invoice, Payment, Vendor, and Vendor Contract records (e.g. via a permission set granted by your Salesforce admin)"
  - "A Vendor record must exist before a Vendor Contract can be created against it"
related: []
deprecated: false
replacement: ""
order: 10
slug: "invoice-management"
---

## Overview

Invoices track what a customer or vendor owes, moving through Draft, Sent, Paid, Overdue, and Cancelled as
work progresses. Recording a Payment against an Invoice is applied automatically — once payments add up to
the full invoice amount, the Invoice is marked Paid without any manual step. Separately, Vendor Contracts
let procurement/finance staff track agreements tied to a Vendor and see which ones are coming up for
renewal. Two Lightning components — an Open Invoices list and an Expiring Vendor Contracts list — can be
added to record pages so anyone can see at a glance what needs attention.

```callout
type: note
Reminders for overdue invoices and expiring vendor contracts are queued/logged internally when their
conditions are met, but no email or Salesforce notification is actually sent to anyone yet — treat the
"reminder" behavior described below as an internal flag, not a customer- or vendor-facing notification.
```

## Prerequisites

- You need edit access to Invoice, Payment, Vendor, and Vendor Contract records.
- A Vendor must already exist before you can create a Vendor Contract for it (Vendor Contract is a child of
  Vendor).
- An Invoice must already exist before you can record a Payment against it (Payment is a child of Invoice).

## Steps to Navigate

1. Open the **App Launcher** and go to the **Vendors** tab. Click **New**, fill in **Contact Email**,
   **Rating**, and **Status** (Prospective, Active, Suspended, or Terminated), then save.

```screenshot
id: invoice-management-vendor-new
alt: New Vendor form with Contact Email, Rating, and Status fields
step: Open the App Launcher, go to the Vendors tab, click New, and fill in the Vendor fields
url_pattern: /lightning/o/Vendor__c/new
```

2. From the Vendor record, use the **Vendor Contracts** related list to add a new Vendor Contract. Fill in
   **Contract Value** and **End Date**, then save.

```screenshot
id: invoice-management-vendor-contract-new
alt: New Vendor Contract form with Contract Value and End Date fields, linked to a Vendor
step: From the Vendor record, add a new Vendor Contract with Contract Value and End Date
url_pattern: /lightning/o/VendorContract__c/new
```

3. Open the **App Launcher** and go to the **Invoices** tab. Click **New**, choose the **Standard Invoice**
   or **Recurring Invoice** record type, fill in **Billing Email**, **Total Amount**, and **Due Date**, and
   save (Status defaults to Draft).

```screenshot
id: invoice-management-invoice-new
alt: New Invoice form showing record type selection and Billing Email, Total Amount, Due Date fields
step: Open the App Launcher, go to the Invoices tab, click New, choose a record type, and fill in the Invoice fields
url_pattern: /lightning/o/Invoice__c/new
```

4. Open the Invoice record and change **Status** from *Draft* to *Sent* once it's ready to bill.

```screenshot
id: invoice-management-invoice-record-page
alt: Salesforce Lightning Invoice record page showing Status, Billing Email, Total Amount, Due Date, and the Payments related list
step: Open the Invoice record just created
url_pattern: /lightning/r/Invoice__c/{recordId}/view
```

5. To record a payment, use the **Payments** related list on the Invoice and click **New**. Fill in
   **Amount** and **Payment Method** (Credit Card, ACH, Wire, or Check), then save.
6. Once the Payments recorded against the Invoice add up to its Total Amount, the Invoice's Status is set to
   **Paid** automatically — no manual step needed.

```callout
type: tip
Partial payments do not change the Invoice's status. Status only flips to Paid once the sum of all
Payments on the Invoice is greater than or equal to its Total Amount.
```

7. Add the **Open Invoices** component (invoiceSummary) or **Expiring Vendor Contracts** component
   (vendorContracts) to an Invoice, Payment, Vendor, or Vendor Contract record page using the Lightning App
   Builder to give users an at-a-glance view.

```screenshot
id: invoice-management-open-invoices-component
alt: Open Invoices Lightning component listing invoices with their status and due date
step: View the Open Invoices component placed on a record page
url_pattern: /lightning/r/Invoice__c/{recordId}/view
```

## Validations & Business Rules

- No field-level validation rules exist yet on Invoice, Payment, Vendor, or Vendor Contract — nothing
  currently stops a negative amount, a past end date, or a blank field from being saved.
- Automation: `PaymentTrigger` (after insert) runs `PaymentTriggerHandler`, which calls
  `InvoiceService.applyPayment()` — this sums every Payment on the related Invoice and sets the Invoice's
  Status to *Paid* once the total meets or exceeds Total Amount.
- Automation: the same Payment insert also calls `PaymentGatewayService.confirmSettlement()`, which sends
  each payment to an external payment gateway (`Payment_Gateway` named credential) asynchronously to confirm
  settlement. The result isn't written back to the Payment record or shown anywhere in the UI.
- Automation: `InvoiceTrigger` (after update) calls `InvoiceService.queueReminders()` whenever an Invoice's
  Status changes to *Overdue*, which queues an internal reminder job — this does not send an email today.
- Automation: `InvoiceOverdueBatch` scans Invoices with Status = *Sent* whose Due Date has passed and marks
  them *Overdue*. This is a batch job and must be run or scheduled by an admin (Setup → Apex Jobs) — it does
  not run on its own on a timer.
- Automation: `VendorContractTrigger` (after insert/update) calls `ContractRenewalService.flagUpcomingExpiry()`,
  which flags Vendor Contracts whose End Date is within 30 days (internally, no field is changed). The
  batch equivalent, `ContractExpiryBatch`, must likewise be run or scheduled manually by an admin.

```callout
type: warning
The Invoice_Overdue_Reminder and Contract_Renewal_Reminder flows are active and fire on the conditions
described above, but currently have no actions configured — they don't yet do anything visible. Don't
rely on either as a real notification path until they're built out further.
```

- The **Open Invoices** component shows Invoices with Status *Sent* or *Overdue*, soonest Due Date first.
- The **Expiring Vendor Contracts** component and the `getExpiringContracts()` API show any Vendor Contract
  whose End Date is 30 days out or sooner — including contracts whose End Date has already passed, since
  there's no lower bound on the query.
- Integration access: `GET /services/apexrest/vendors/` returns the same expiring-contracts list as above,
  for external systems. It's read-only and respects the calling user's record access.

## Related Features

- None yet documented.
