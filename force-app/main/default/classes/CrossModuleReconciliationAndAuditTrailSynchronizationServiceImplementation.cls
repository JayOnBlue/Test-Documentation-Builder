/**
 * Deliberately over-long class name — stress-tests that the UI wraps long
 * component names instead of clipping or causing horizontal scroll.
 */
public class CrossModuleReconciliationAndAuditTrailSynchronizationServiceImplementation implements Schedulable {

    public void execute(SchedulableContext sc) {
        reconcileInvoicesAndContracts();
    }

    public void reconcileInvoicesAndContracts() {
        List<Invoice__c> openInvoices = InvoiceService.getOpenInvoices();
        List<VendorContract__c> expiring = ContractRenewalService.getExpiringContracts();
        System.debug('Reconciling ' + openInvoices.size() + ' invoices against ' + expiring.size() + ' expiring contracts');
    }
}
