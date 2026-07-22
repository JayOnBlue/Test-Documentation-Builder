trigger SupportTicketTrigger on SupportTicket__c (after insert, after update) {
    if (Trigger.isAfter && Trigger.isInsert) {
        SupportTicketTriggerHandler.handleAfterInsert(Trigger.new);
    }
    if (Trigger.isAfter && Trigger.isUpdate) {
        SupportTicketTriggerHandler.handleAfterUpdate(Trigger.new, Trigger.oldMap);
    }
}
