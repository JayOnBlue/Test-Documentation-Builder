---
title: "Campaign Request Management"
feature: "Campaign Request Management"
category: "Campaigns"
description: "How marketing submits ad campaign requests, gets budget approval, launches them to the ad platform, and tracks performance."
owner: "Marketing Ops"
verified: true
prerequisites:
  - "Edit access to Campaign Request records (e.g. via a permission set granted by your Salesforce admin)"
  - "The external ad platform connection (\"Ad_Platform\" named credential) must already be configured for Live campaigns to sync"
order: 10
slug: "campaign-request-management"
---

## Overview

Campaign Requests let marketing staff submit a proposed ad campaign — name, budget, and target audience —
and move it through approval before it goes live. Larger budgets are automatically flagged for approval,
and once a campaign is marked Live it's pushed to the external ad platform automatically. Anyone who owns
the campaign can also check its performance (impressions and clicks) directly from the record.

```callout
type: before
Fill in Campaign Name, Budget, and Target Audience before changing Status away from Draft — the budget
approval check and the ad platform sync both depend on these being set correctly.
```

## Prerequisites

- You need edit access to Campaign Request records.
- For a campaign to actually reach the ad platform when it goes Live, the org's connection to the ad
  platform must already be set up by an admin.

## Steps to Navigate

1. Open the **App Launcher** and go to the **Campaign Requests** tab.

```screenshot
id: campaign-request-management-tab
alt: Campaign Requests tab list view showing existing Campaign Request records
step: Open the App Launcher and click the Campaign Requests tab
url_pattern: /lightning/o/CampaignRequest__c/home
```

2. Click **New**, fill in **Campaign Name**, **Budget**, and **Target Audience**, then save. New requests
   start in **Draft** status.

```screenshot
id: campaign-request-management-new
alt: New Campaign Request form with Campaign Name, Budget, and Target Audience fields filled in
step: Click New on the Campaign Requests tab and fill in the campaign details
url_pattern: /lightning/o/CampaignRequest__c/new
```

3. Open the Campaign Request record. Change **Status** to *Pending Approval* once it's ready for review.

```screenshot
id: campaign-request-management-record-page
alt: Salesforce Lightning Campaign Request record page showing Status, Budget, and Campaign Performance
step: Open the Campaign Request record just created
url_pattern: /lightning/r/CampaignRequest__c/{recordId}/view
```

```callout
type: note
If the Budget is over $10,000, saving the record automatically runs the Campaign Budget Approval
process on top of the normal review — no extra steps needed, but approval may take longer.
```

4. Once reviewed, change **Status** to *Approved*.
5. When you're ready to launch, change **Status** to *Live* and save. This automatically sends the
   campaign to the ad platform — no further action is needed.

```callout
type: note
Sending the campaign to the ad platform happens asynchronously (`@future`), so it won't happen in the
same transaction — allow a few seconds after saving before it shows up on the ad platform side.
```

6. Scroll to the **Campaign Performance** component on the record page to see impressions and clicks
   recorded for this campaign so far.
7. When the campaign has run its course, change **Status** to *Completed*.

## Validations & Business Rules

- **Status** is a picklist: Draft, Pending Approval, Approved, Live, Completed.
- Changing **Status** to *Live* triggers `CampaignRequestTrigger`, which calls
  `CampaignRequestTriggerHandler.handleAfterUpdate()` → `CampaignSyncService.syncToAdPlatform()`. This only
  fires on the transition into Live (going from any other status to Live) — re-saving a record that's
  already Live does not re-sync it.
- `CampaignSyncService.syncToAdPlatform()` hands off to `CampaignAdPlatformCallout.pushCampaigns()`, an
  `@future(callout=true)` method that posts each campaign's Name and Budget to the ad platform.
- A **Campaign Budget Approval** flow (`Campaign_Budget_Approval`) runs automatically whenever a Campaign
  Request is updated with **Budget** over $10,000.
- Campaign performance (Impressions, Clicks) is stored on child **Campaign Metric** records linked to the
  Campaign Request; the **Campaign Performance** component on the record page reads these live via
  `CampaignSyncService.getCampaignMetrics()`.
- A batch class (`CampaignMetricsBatch`) recalculates campaign metrics but isn't scheduled to run
  automatically yet — an admin would need to schedule it (Setup → Apex Classes → Schedule Apex) for
  metrics to be recalculated on a recurring basis.

## Related Features

- See **Technical Reference → CampaignSyncService** for the exact method-level behavior of the ad
  platform sync.
