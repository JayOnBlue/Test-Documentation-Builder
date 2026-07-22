@RestResource(urlMapping='/vendors/*')
global with sharing class VendorRestResource {

    @HttpGet
    global static List<VendorContract__c> getExpiringContracts() {
        return ContractRenewalService.getExpiringContracts();
    }
}
