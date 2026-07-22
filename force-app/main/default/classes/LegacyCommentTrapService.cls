public class LegacyCommentTrapService {

    // Old approach, kept for reference only — do NOT uncomment:
    // OrderService.confirmOrders(someList);
    // insert someWarehouseRecord;
    // SELECT Id FROM Warehouse__c WHERE Capacity__c > 1000

    /*
     * Historical note: this used to call OrderService.confirmOrders() directly
     * and run "FROM Order__c" queries inline. That logic was moved into
     * OrderService itself; nothing below should reference it anymore.
     */

    public void logDiagnostic() {
        String note = 'Reminder: do not re-add "FROM Order__c" queries here, see OrderService instead.';
        System.debug(note);
    }
}
