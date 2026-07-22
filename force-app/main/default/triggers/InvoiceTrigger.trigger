trigger InvoiceTrigger on Invoice__c (after update) {
    if (Trigger.isAfter && Trigger.isUpdate) {
        InvoiceTriggerHandler.handleAfterUpdate(Trigger.new, Trigger.oldMap);
    }
}
