public with sharing class TicketAssignmentService {

    public static void assignOwners(List<SupportTicket__c> tickets) {
        for (SupportTicket__c t : tickets) {
            t.Status__c = t.Status__c == null ? 'Open' : t.Status__c;
        }
        update tickets;
    }

    public static void notifyEscalationTeam(List<SupportTicket__c> tickets) {
        System.debug('Escalation notification for ' + tickets.size() + ' ticket(s)');
    }

    @AuraEnabled(cacheable=true)
    public static List<SupportTicket__c> getOpenTickets() {
        return [
            SELECT Id, Subject__c, Status__c, Priority__c, Customer_Email__c
            FROM SupportTicket__c
            WHERE Status__c IN ('Open', 'In Progress')
            ORDER BY Priority__c DESC
        ];
    }
}
