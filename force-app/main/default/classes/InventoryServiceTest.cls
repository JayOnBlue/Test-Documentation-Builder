@IsTest
private class InventoryServiceTest {
    @IsTest
    static void getLowStockProductsReturnsOnlyBreached() {
        Product__c low = new Product__c(SKU__c = 'SKU-LOW', Price__c = 5, QuantityOnHand__c = 1, ReorderThreshold__c = 10);
        Product__c healthy = new Product__c(SKU__c = 'SKU-OK', Price__c = 5, QuantityOnHand__c = 100, ReorderThreshold__c = 10);
        insert new List<Product__c>{ low, healthy };

        Test.startTest();
        List<Product__c> result = InventoryService.getLowStockProducts();
        Test.stopTest();

        System.assertEquals(1, result.size());
    }
}
