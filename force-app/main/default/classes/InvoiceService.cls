public with sharing class InvoiceService {

    public static void queueReminders(List<Invoice__c> invoices) {
        Set<Id> ids = new Set<Id>();
        for (Invoice__c inv : invoices) {
            ids.add(inv.Id);
        }
        System.enqueueJob(new InvoiceReminderQueueable(ids));
    }

    public static void applyPayment(Payment__c payment) {
        Invoice__c inv = [SELECT Id, Total_Amount__c, Status__c FROM Invoice__c WHERE Id = :payment.Invoice__c];
        List<Payment__c> allPayments = [SELECT Amount__c FROM Payment__c WHERE Invoice__c = :inv.Id];
        Decimal totalPaid = 0;
        for (Payment__c p : allPayments) {
            totalPaid += p.Amount__c;
        }
        if (totalPaid >= inv.Total_Amount__c) {
            inv.Status__c = 'Paid';
            update inv;
        }
    }

    @AuraEnabled(cacheable=true)
    public static List<Invoice__c> getOpenInvoices() {
        return [
            SELECT Id, Name, Status__c, Total_Amount__c, Due_Date__c
            FROM Invoice__c
            WHERE Status__c IN ('Sent', 'Overdue')
            ORDER BY Due_Date__c ASC
        ];
    }
}
