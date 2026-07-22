public class ContractExpiryBatch implements Database.Batchable<SObject> {

    public Database.QueryLocator start(Database.BatchableContext bc) {
        return Database.getQueryLocator([SELECT Id, Vendor__c, Contract_Value__c, End_Date__c FROM VendorContract__c]);
    }

    public void execute(Database.BatchableContext bc, List<VendorContract__c> scope) {
        ContractRenewalService.flagUpcomingExpiry(scope);
    }

    public void finish(Database.BatchableContext bc) {
        System.debug('ContractExpiryBatch complete');
    }
}
