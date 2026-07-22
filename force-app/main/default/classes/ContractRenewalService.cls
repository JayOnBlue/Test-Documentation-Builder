public with sharing class ContractRenewalService {

    public static void flagUpcomingExpiry(List<VendorContract__c> contracts) {
        for (VendorContract__c c : contracts) {
            if (c.End_Date__c != null && c.End_Date__c <= Date.today().addDays(30)) {
                System.debug('Contract ' + c.Id + ' expiring soon');
            }
        }
    }

    @AuraEnabled(cacheable=true)
    public static List<VendorContract__c> getExpiringContracts() {
        return [
            SELECT Id, Vendor__c, Contract_Value__c, End_Date__c
            FROM VendorContract__c
            WHERE End_Date__c <= :Date.today().addDays(30)
            ORDER BY End_Date__c ASC
        ];
    }
}
