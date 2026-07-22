public class PaymentTriggerHandler {
    public static void handleAfterInsert(List<Payment__c> payments) {
        for (Payment__c p : payments) {
            InvoiceService.applyPayment(p);
        }
        PaymentGatewayService.confirmSettlement(payments);
    }
}
