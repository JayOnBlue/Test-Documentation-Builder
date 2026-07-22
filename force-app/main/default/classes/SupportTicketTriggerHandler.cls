public class SupportTicketTriggerHandler {

    public static void handleAfterInsert(List<SupportTicket__c> newTickets) {
        TicketAssignmentService.assignOwners(newTickets);
    }

    public static void handleAfterUpdate(List<SupportTicket__c> newTickets, Map<Id, SupportTicket__c> oldMap) {
        List<SupportTicket__c> nowEscalated = new List<SupportTicket__c>();
        for (SupportTicket__c t : newTickets) {
            if (t.Status__c == 'Escalated' && oldMap.get(t.Id).Status__c != 'Escalated') {
                nowEscalated.add(t);
            }
        }
        if (!nowEscalated.isEmpty()) {
            TicketAssignmentService.notifyEscalationTeam(nowEscalated);
        }
    }
}
