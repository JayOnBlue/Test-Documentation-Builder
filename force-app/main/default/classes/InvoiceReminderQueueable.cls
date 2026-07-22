public class InvoiceReminderQueueable implements Queueable {
    private Set<Id> invoiceIds;

    public InvoiceReminderQueueable(Set<Id> invoiceIds) {
        this.invoiceIds = invoiceIds;
    }

    public void execute(QueueableContext context) {
        List<Invoice__c> invoices = [SELECT Id, Billing_Email__c FROM Invoice__c WHERE Id IN :invoiceIds];
        for (Invoice__c inv : invoices) {
            System.debug('Reminder queued for ' + inv.Billing_Email__c);
        }
    }
}
