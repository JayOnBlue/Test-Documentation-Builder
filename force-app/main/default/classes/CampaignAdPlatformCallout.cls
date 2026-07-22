public class CampaignAdPlatformCallout {

    @future(callout=true)
    public static void pushCampaigns(Set<Id> campaignRequestIds) {
        List<CampaignRequest__c> campaigns = [
            SELECT Id, Campaign_Name__c, Budget__c
            FROM CampaignRequest__c
            WHERE Id IN :campaignRequestIds
        ];
        for (CampaignRequest__c c : campaigns) {
            HttpRequest req = new HttpRequest();
            req.setEndpoint('callout:Ad_Platform/campaigns');
            req.setMethod('POST');
            req.setBody(JSON.serialize(c));
            Http http = new Http();
            HttpResponse res = http.send(req);
            System.debug('Ad platform sync status: ' + res.getStatusCode());
        }
    }
}
