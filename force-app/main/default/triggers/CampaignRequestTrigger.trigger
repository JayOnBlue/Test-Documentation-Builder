trigger CampaignRequestTrigger on CampaignRequest__c (after update) {
    if (Trigger.isAfter && Trigger.isUpdate) {
        CampaignRequestTriggerHandler.handleAfterUpdate(Trigger.new, Trigger.oldMap);
    }
}
