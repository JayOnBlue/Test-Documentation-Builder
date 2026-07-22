public class ProductTriggerHandler {
    public static void handleBeforeUpdate(List<Product__c> newProducts, Map<Id, Product__c> oldMap) {
        List<Product__c> breachedThreshold = new List<Product__c>();
        for (Product__c p : newProducts) {
            if (p.QuantityOnHand__c < p.ReorderThreshold__c) {
                breachedThreshold.add(p);
            }
        }
        if (!breachedThreshold.isEmpty()) {
            InventoryService.flagLowStock(breachedThreshold);
        }
    }
}
