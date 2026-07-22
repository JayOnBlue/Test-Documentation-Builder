public class SupportTicketCommentTriggerHandler {
    public static void handleAfterInsert(List<SupportTicketComment__c> comments) {
        Set<Id> ticketIds = new Set<Id>();
        for (SupportTicketComment__c c : comments) {
            ticketIds.add(c.SupportTicket__c);
        }
        System.debug('New comments on ' + ticketIds.size() + ' ticket(s)');
    }
}
