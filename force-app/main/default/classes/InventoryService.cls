public with sharing class InventoryService {

    public static void flagLowStock(List<Product__c> products) {
        Set<Id> productIds = new Set<Id>();
        for (Product__c p : products) {
            productIds.add(p.Id);
        }
        System.enqueueJob(new LowStockAlertQueueable(productIds));
    }

    @AuraEnabled(cacheable=true)
    public static List<Product__c> getLowStockProducts() {
        return [
            SELECT Id, Name, SKU__c, QuantityOnHand__c, ReorderThreshold__c
            FROM Product__c
            WHERE QuantityOnHand__c < ReorderThreshold__c
            ORDER BY QuantityOnHand__c ASC
        ];
    }
}
