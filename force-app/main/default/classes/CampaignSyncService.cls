public with sharing class CampaignSyncService {

    public static void syncToAdPlatform(List<CampaignRequest__c> campaigns) {
        Set<Id> ids = new Set<Id>();
        for (CampaignRequest__c c : campaigns) {
            ids.add(c.Id);
        }
        CampaignAdPlatformCallout.pushCampaigns(ids);
    }

    @AuraEnabled(cacheable=true)
    public static List<CampaignMetric__c> getCampaignMetrics(Id campaignRequestId) {
        return [
            SELECT Id, Impressions__c, Clicks__c, Conversions__c
            FROM CampaignMetric__c
            WHERE CampaignRequest__c = :campaignRequestId
        ];
    }
}
