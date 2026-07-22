public class CampaignMetricsBatch implements Database.Batchable<SObject> {

    public Database.QueryLocator start(Database.BatchableContext bc) {
        return Database.getQueryLocator([SELECT Id, CampaignRequest__c, Impressions__c, Clicks__c FROM CampaignMetric__c]);
    }

    public void execute(Database.BatchableContext bc, List<CampaignMetric__c> scope) {
        for (CampaignMetric__c m : scope) {
            if (m.Impressions__c != null && m.Impressions__c > 0) {
                m.Conversions__c = m.Clicks__c;
            }
        }
        update scope;
    }

    public void finish(Database.BatchableContext bc) {
        System.debug('CampaignMetricsBatch complete');
    }
}
