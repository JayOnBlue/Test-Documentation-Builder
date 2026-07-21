public class OrderNotifier {
    @future
    public static void sendConfirmationEmails(List<Order__c> orders) {
        for (Order__c ord : orders) {
            System.debug('Sending confirmation email to ' + ord.Customer_Email__c);
        }
    }
}
