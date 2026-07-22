public class InvoiceTriggerHandler {
    public static void handleAfterUpdate(List<Invoice__c> newInvoices, Map<Id, Invoice__c> oldMap) {
        List<Invoice__c> nowOverdue = new List<Invoice__c>();
        for (Invoice__c inv : newInvoices) {
            if (inv.Status__c == 'Overdue' && oldMap.get(inv.Id).Status__c != 'Overdue') {
                nowOverdue.add(inv);
            }
        }
        if (!nowOverdue.isEmpty()) {
            InvoiceService.queueReminders(nowOverdue);
        }
    }
}
