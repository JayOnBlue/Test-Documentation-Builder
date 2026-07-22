public class CampaignRequestTriggerHandler {
    public static void handleAfterUpdate(List<CampaignRequest__c> newRequests, Map<Id, CampaignRequest__c> oldMap) {
        List<CampaignRequest__c> nowLive = new List<CampaignRequest__c>();
        for (CampaignRequest__c c : newRequests) {
            if (c.Status__c == 'Live' && oldMap.get(c.Id).Status__c != 'Live') {
                nowLive.add(c);
            }
        }
        if (!nowLive.isEmpty()) {
            CampaignSyncService.syncToAdPlatform(nowLive);
        }
    }
}
