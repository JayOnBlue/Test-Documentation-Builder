public class VendorContractTriggerHandler {
    public static void handleAfterSave(List<VendorContract__c> contracts) {
        ContractRenewalService.flagUpcomingExpiry(contracts);
    }
}
