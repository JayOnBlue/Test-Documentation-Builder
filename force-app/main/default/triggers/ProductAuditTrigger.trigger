trigger ProductAuditTrigger on Product__c (after update) {
    if (Trigger.isAfter && Trigger.isUpdate) {
        ProductAuditTriggerHandler.handleAfterUpdate(Trigger.new, Trigger.oldMap);
    }
}
