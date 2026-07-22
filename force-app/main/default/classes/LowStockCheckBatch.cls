public class LowStockCheckBatch implements Database.Batchable<SObject> {

    public Database.QueryLocator start(Database.BatchableContext bc) {
        return Database.getQueryLocator([
            SELECT Id, Name, QuantityOnHand__c, ReorderThreshold__c
            FROM Product__c
        ]);
    }

    public void execute(Database.BatchableContext bc, List<Product__c> scope) {
        List<Product__c> lowStock = new List<Product__c>();
        for (Product__c p : scope) {
            if (p.QuantityOnHand__c < p.ReorderThreshold__c) {
                lowStock.add(p);
            }
        }
        if (!lowStock.isEmpty()) {
            InventoryService.flagLowStock(lowStock);
        }
    }

    public void finish(Database.BatchableContext bc) {
        System.debug('LowStockCheckBatch complete');
    }
}
