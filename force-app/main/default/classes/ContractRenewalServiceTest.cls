@IsTest
private class ContractRenewalServiceTest {
    @IsTest
    static void getExpiringContractsReturnsOnlyNearExpiry() {
        Vendor__c v = new Vendor__c(Status__c = 'Active', Contact_Email__c = 'vendor@example.com', Rating__c = 4);
        insert v;
        VendorContract__c near = new VendorContract__c(Vendor__c = v.Id, Contract_Value__c = 10000, End_Date__c = Date.today().addDays(5));
        VendorContract__c far = new VendorContract__c(Vendor__c = v.Id, Contract_Value__c = 10000, End_Date__c = Date.today().addDays(300));
        insert new List<VendorContract__c>{ near, far };

        Test.startTest();
        List<VendorContract__c> result = ContractRenewalService.getExpiringContracts();
        Test.stopTest();

        System.assertEquals(1, result.size());
    }
}
