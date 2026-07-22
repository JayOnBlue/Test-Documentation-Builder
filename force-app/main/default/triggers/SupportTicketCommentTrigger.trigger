trigger SupportTicketCommentTrigger on SupportTicketComment__c (after insert) {
    if (Trigger.isAfter && Trigger.isInsert) {
        SupportTicketCommentTriggerHandler.handleAfterInsert(Trigger.new);
    }
}
