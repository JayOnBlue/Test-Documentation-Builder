public class InvoiceOverdueBatch implements Database.Batchable<SObject> {

    public Database.QueryLocator start(Database.BatchableContext bc) {
        return Database.getQueryLocator([
            SELECT Id, Status__c, Due_Date__c
            FROM Invoice__c
            WHERE Status__c = 'Sent' AND Due_Date__c < TODAY
        ]);
    }

    public void execute(Database.BatchableContext bc, List<Invoice__c> scope) {
        for (Invoice__c inv : scope) {
            inv.Status__c = 'Overdue';
        }
        update scope;
    }

    public void finish(Database.BatchableContext bc) {
        System.debug('InvoiceOverdueBatch complete');
    }
}
