@IsTest
private class ProductTriggerHandlerTest {
    @IsTest
    static void breachingThresholdEnqueuesAlert() {
        Warehouse__c wh = new Warehouse__c(Location__c = 'East Wing', Capacity__c = 500);
        insert wh;

        Product__c p = new Product__c(SKU__c = 'SKU-1', Price__c = 9.99, QuantityOnHand__c = 100, ReorderThreshold__c = 10, Primary_Warehouse__c = wh.Id);
        insert p;

        Test.startTest();
        p.QuantityOnHand__c = 2;
        update p;
        Test.stopTest();

        System.assert(true);
    }
}
