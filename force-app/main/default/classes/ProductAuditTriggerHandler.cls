public class ProductAuditTriggerHandler {
    public static void handleAfterUpdate(List<Product__c> newProducts, Map<Id, Product__c> oldMap) {
        for (Product__c p : newProducts) {
            Product__c old = oldMap.get(p.Id);
            if (p.Price__c != old.Price__c) {
                System.debug('Price changed on ' + p.Id + ': ' + old.Price__c + ' -> ' + p.Price__c);
            }
        }
    }
}
