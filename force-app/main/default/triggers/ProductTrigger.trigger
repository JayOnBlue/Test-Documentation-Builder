trigger ProductTrigger on Product__c (before update) {
    if (Trigger.isBefore && Trigger.isUpdate) {
        ProductTriggerHandler.handleBeforeUpdate(Trigger.new, Trigger.oldMap);
    }
}
