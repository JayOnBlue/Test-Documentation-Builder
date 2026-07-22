public class TicketEscalationSchedulable implements Schedulable {

    public void execute(SchedulableContext sc) {
        List<SupportTicket__c> overdue = [
            SELECT Id, Status__c
            FROM SupportTicket__c
            WHERE Status__c = 'Open' AND CreatedDate < LAST_N_DAYS:2
        ];
        for (SupportTicket__c t : overdue) {
            t.Status__c = 'Escalated';
        }
        if (!overdue.isEmpty()) {
            update overdue;
            TicketAssignmentService.notifyEscalationTeam(overdue);
        }
    }
}
