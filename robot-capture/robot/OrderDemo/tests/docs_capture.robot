*** Settings ***
Documentation    Captures every documentation screenshot against a real Salesforce org using
...              CumulusCI's SalesforcePlaywright library — real UI navigation and multi-step
...              interactions (App Launcher, tab clicks, filling in a New Order form), not just
...              URL changes.
...
...              Run:  cci task run capture_docs --org <org>
...              Images are written to ../../docs/images (the doc site picks them up on the next
...              `node docs/scripts/build-site.js`).

Resource         cumulusci/robotframework/SalesforcePlaywright.robot
Resource         ${CURDIR}/../resources/OrderDemo.resource

Suite Setup      Run Keywords    Open Test Browser    size=1680x1050    AND    Set Doc Base Url
Suite Teardown   Close Browser


*** Test Cases ***
Capture Navigable Pages
    [Documentation]    Single-navigation fallback for every manifest entry, including record pages
    ...                (record IDs are resolved automatically via SOQL). The App Launcher / Orders
    ...                tab / New Order shots get a plain-navigation image here first, then the
    ...                dedicated interactive test cases below overwrite them with the real thing.
    ${dir}=          Images Dir Path
    @{shots}=        Navigable Screenshots
    FOR    ${shot}    IN    @{shots}
        Run Keyword And Continue On Failure    Capture Navigable Screenshot    ${shot}    ${dir}
    END

Capture App Launcher and Orders Tab — Order Lifecycle
    [Documentation]    Multi-step interaction: open the App Launcher, search "Order Management"
    ...                (captured as-is — the real thing a user sees), click its tile to switch
    ...                into the app, then click the Orders tab.
    Show App Launcher Search    Order Management
    Capture Screenshot As    order-lifecycle-app-launcher
    Click            a:has-text("Order Management") >> nth=0
    Wait Until Loading Is Complete
    Sleep            1s
    Open Tab From Navigation Bar    Orders
    Capture Screenshot As    order-lifecycle-orders-tab

Capture Create Order Form — Order Lifecycle
    [Documentation]    Multi-step interaction: click New on the Orders tab, fill in Customer Email,
    ...                screenshot the filled-in form before saving, then save — this also creates
    ...                the sample Order record the next test case opens.
    Go To            ${DOC_BASE}/lightning/o/Order__c/home
    Wait Until Loading Is Complete
    Click            button:has-text("New")
    Wait Until Modal Is Open
    Fill Text        input[name="Customer_Email__c"]    demo.customer@example.com
    Capture Screenshot As    order-lifecycle-create-order
    Click            button:has-text("Save")
    Wait Until Modal Is Closed
    Wait Until Loading Is Complete

Capture Order Record Page — Order Lifecycle
    [Documentation]    Open the Order record just created and capture its detail page.
    ${id}=           Record Id For Object    Order__c
    Go To            ${DOC_BASE}/lightning/r/Order__c/${id}/view
    Wait Until Loading Is Complete
    Sleep            1.5s
    Capture Screenshot As    order-lifecycle-record-page

# ---------------------------------------------------------------------------
# ADD MORE MULTI-STEP CAPTURES HERE.
#
# Any screenshot whose `step` in docs/screenshot-manifest.json describes clicks/typing
# (not just a page) gets its own test case like the ones above, ending with
# `Capture Screenshot As <screenshot-id>`. Keyword reference:
#   https://cumulusci.readthedocs.io/en/stable/Keywords.html
#   https://marketsquare.github.io/robotframework-browser/Browser.html
# ---------------------------------------------------------------------------
