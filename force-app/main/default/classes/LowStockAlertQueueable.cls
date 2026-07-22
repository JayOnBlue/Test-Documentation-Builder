public class LowStockAlertQueueable implements Queueable {
    private Set<Id> productIds;

    public LowStockAlertQueueable(Set<Id> productIds) {
        this.productIds = productIds;
    }

    public void execute(QueueableContext context) {
        List<Product__c> products = [SELECT Id, Name, SKU__c FROM Product__c WHERE Id IN :productIds];
        for (Product__c p : products) {
            System.debug('Low stock alert queued for ' + p.SKU__c);
        }
    }
}
