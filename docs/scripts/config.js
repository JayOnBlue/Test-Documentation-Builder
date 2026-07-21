module.exports = {
  siteName: 'Order Management Documentation',

  // Role picker ("I work in...") on the Overview page. Keys are role ids; values are the
  // business-doc *categories* that role's sidebar filter keeps. "Getting Started" is always
  // kept regardless of the active role. "developer" is handled specially — it jumps straight
  // to /tech instead of filtering the business sidebar.
  roleCategories: {
    // This demo only has one real business category, so both roles map to it —
    // the point is to demonstrate the filter mechanism works, not to model real
    // QE360 role boundaries. Add more categories/roles as the content grows.
    sales: ['Orders'],
    operations: ['Orders'],
  },

  glossary: [
    { term: 'Order', definition: 'A confirmed or in-progress customer purchase, made up of one or more Order Lines.' },
    { term: 'Order Line', definition: "A single product/quantity/price entry on an Order — one row of what's being purchased." },
    { term: 'Confirmed', definition: 'The Order status meaning the sale is final: lines are locked and the customer has been notified.' },
    { term: 'Coverage', definition: "A static proxy for Apex test coverage in this demo — whether a Test class in the repo references a class, not a real org test run." },
  ],
};
