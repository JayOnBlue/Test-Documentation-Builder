public class PaymentGatewayService {

    @future(callout=true)
    public static void confirmSettlement(List<Payment__c> payments) {
        for (Payment__c p : payments) {
            HttpRequest req = new HttpRequest();
            req.setEndpoint('callout:Payment_Gateway/settlements');
            req.setMethod('POST');
            Http http = new Http();
            HttpResponse res = http.send(req);
            System.debug('Settlement response: ' + res.getStatusCode());
        }
    }
}
