trigger VendorContractTrigger on VendorContract__c (after insert, after update) {
    if (Trigger.isAfter) {
        VendorContractTriggerHandler.handleAfterSave(Trigger.new);
    }
}
